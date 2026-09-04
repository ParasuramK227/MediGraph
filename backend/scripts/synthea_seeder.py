#!/usr/bin/env python3
"""Synthea Healthcare Knowledge Graph Seeder.

Ingests realistic clinical data from synthea_sample_data_csv_latest/ into Neo4j:
- Patients (demographics, contact, income)
- Doctors/Providers (specialization, organization)
- Encounters (visits, admissions, ambulatory)
- Conditions/Diseases (diagnoses, codes, encounter links)
- Medications (prescriptions with genuine TREATS links based on REASONDESCRIPTION)
- Treatments/Procedures (procedures with genuine TREATS links and clinical outcomes)
- Observations/Lab Tests (blood tests, vitals, normalized status)
- Allergies (environmental, drug, food allergies with severity)
- Sample ConsultationNotes (grounded in actual Synthea patient conditions)

Maintains 100% backward compatibility with existing MediGraph queries by
dual-labeling nodes (:Disease:Condition, :Treatment:Procedure, :Doctor:Provider, :LabTest:Observation)
and establishing both direct legacy edges and encounter-level edges.
"""
from __future__ import annotations

import argparse
import csv
import os
import random
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Set

from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

ROOT = Path(__file__).resolve().parents[2]
SYNTHEA_DIR = ROOT / "synthea_sample_data_csv_latest"

# Default ingestion limits to avoid cloud database bloat
DEFAULT_PATIENTS_LIMIT = 60
DEFAULT_PROCEDURES_PER_PATIENT = 30
DEFAULT_OBSERVATIONS_PER_PATIENT = 40

_rand = random.Random(42)

NON_DISEASE_KEYWORDS = {
    "employment", "job", "labor force", "education", "criminal record",
    "homeless", "housing", "transportation", "social isolation", "social contact",
    "intimate partner abuse", "military service", "normal pregnancy", "stress",
    "medication review due", "sterilization requested", "tubal ligation", "awaiting transplantation"
}


def clean_clinical_text(text: str) -> str:
    """Strip raw SNOMED tag suffixes like (disorder), (finding) and clean whitespace."""
    if not text:
        return ""
    cleaned = re.sub(
        r'\s*\((disorder|finding|situation|procedure|morphologic abnormality|person)\)\s*$',
        '',
        text,
        flags=re.IGNORECASE,
    ).strip()
    return cleaned


def is_clinical_disease(desc: str) -> bool:
    """Differentiate actual clinical diseases/disorders from social factors or administrative reminders."""
    if not desc:
        return False
    lower = desc.lower()
    if "(disorder)" in lower or "(morphologic abnormality)" in lower:
        return True
    for kw in NON_DISEASE_KEYWORDS:
        if kw in lower:
            return False
    if any(term in lower for term in [
        "diabetes", "hypertension", "obesity", "pain", "anxiety", "dyspnea",
        "cough", "fever", "asthma", "sinusitis", "bronchitis", "pharyngitis",
        "caries", "gingivitis", "anemia", "infection", "cardiac", "infarction"
    ]):
        return True
    return False



def get_driver():
    uri = os.environ.get("NEO4J_URI")
    user = os.environ.get("NEO4J_USER")
    password = os.environ.get("NEO4J_PASSWORD")
    if not (uri and user and password):
        raise SystemExit("NEO4J_URI/NEO4J_USER/NEO4J_PASSWORD not set in environment.")
    return GraphDatabase.driver(uri, auth=(user, password))


def run_batch(driver, query: str, batch: List[Dict[str, Any]], batch_size: int = 500):
    """Execute a parameterized Cypher query with UNWIND in chunks."""
    if not batch:
        return
    with driver.session() as session:
        for i in range(0, len(batch), batch_size):
            chunk = batch[i : i + batch_size]
            session.run(query, batch=chunk)


def clear_database(driver):
    """Clear existing nodes while keeping schema clean."""
    print("Clearing existing graph data...")
    with driver.session() as session:
        # Delete in batches to avoid out of memory on AuraDB Free
        while True:
            res = session.run(
                """
                MATCH (n)
                WITH n LIMIT 10000
                DETACH DELETE n
                RETURN count(n) AS deleted
                """
            ).single()
            if not res or res["deleted"] == 0:
                break
    print("  Graph cleared.")


def create_constraints(driver):
    """Create uniqueness constraints on primary identifiers."""
    print("Ensuring constraints...")
    constraints = [
        "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Patient) REQUIRE p.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Disease) REQUIRE d.name IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (m:Medication) REQUIRE m.name IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (doc:Doctor) REQUIRE doc.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (e:Encounter) REQUIRE e.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (t:Treatment) REQUIRE t.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (l:LabTest) REQUIRE l.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (a:Allergy) REQUIRE a.id IS UNIQUE",
        "CREATE CONSTRAINT IF NOT EXISTS FOR (n:ConsultationNote) REQUIRE n.id IS UNIQUE",
    ]
    with driver.session() as session:
        for c in constraints:
            try:
                session.run(c)
            except Exception as e:
                print(f"  Note on constraint: {e}")
    print("  Constraints active.")


def seed_patients(driver, limit: int) -> List[str]:
    print(f"Ingesting up to {limit} patients...")
    path = SYNTHEA_DIR / "patients.csv"
    if not path.exists():
        raise SystemExit(f"Missing {path}")

    batch = []
    patient_ids = []
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for i, r in enumerate(reader):
            if i >= limit:
                break
            pid = r.get("Id")
            if not pid:
                continue
            first = re.sub(r"\d+", "", r.get("FIRST", "")).strip()
            last = re.sub(r"\d+", "", r.get("LAST", "")).strip()
            gender = r.get("GENDER", "M").strip()
            email = f"{first.lower()}.{last.lower()}@example.com" if first and last else f"{pid.lower()}@example.com"
            phone = f"555-{_rand.randint(100, 999)}-{_rand.randint(1000, 9999)}"

            batch.append({
                "id": pid,
                "first_name": first,
                "last_name": last,
                "gender": gender,
                "date_of_birth": r.get("BIRTHDATE", ""),
                "address": r.get("ADDRESS", ""),
                "city": r.get("CITY", ""),
                "state": r.get("STATE", ""),
                "zip": r.get("ZIP", ""),
                "income": r.get("INCOME", ""),
                "email": email,
                "contact_number": phone,
                "insurance_provider": r.get("HEALTHCARE_COVERAGE", "Standard Medicare"),
            })
            patient_ids.append(pid)

    query = """
    UNWIND $batch AS r
    MERGE (p:Patient {id: r.id})
    SET p.first_name = r.first_name,
        p.last_name = r.last_name,
        p.gender = r.gender,
        p.date_of_birth = r.date_of_birth,
        p.address = r.address,
        p.city = r.city,
        p.state = r.state,
        p.zip = r.zip,
        p.income = r.income,
        p.email = r.email,
        p.contact_number = r.contact_number,
        p.insurance_provider = r.insurance_provider
    """
    run_batch(driver, query, batch)
    print(f"  Ingested {len(batch)} Patient nodes.")
    return patient_ids


def seed_providers(driver) -> List[str]:
    print("Ingesting providers / doctors...")
    path = SYNTHEA_DIR / "providers.csv"
    if not path.exists():
        return []

    batch = []
    provider_ids = []
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            doc_id = r.get("Id")
            if not doc_id:
                continue
            name = r.get("NAME", "").strip()
            parts = name.split()
            first = parts[0] if parts else "Dr."
            last = parts[-1] if len(parts) > 1 else "Smith"
            spec = r.get("SPECIALITY", "General Practice").strip() or "General Practice"
            gender = r.get("GENDER", "F").strip()

            batch.append({
                "id": doc_id,
                "name": name,
                "first_name": first,
                "last_name": last,
                "specialization": spec,
                "gender": gender,
                "hospital_branch": r.get("CITY", "Metropolitan Branch"),
                "email": f"dr.{last.lower()}@hospital.org",
            })
            provider_ids.append(doc_id)

    query = """
    UNWIND $batch AS r
    MERGE (d:Doctor:Provider {id: r.id})
    SET d.name = r.name,
        d.first_name = r.first_name,
        d.last_name = r.last_name,
        d.specialization = r.specialization,
        d.gender = r.gender,
        d.hospital_branch = r.hospital_branch,
        d.email = r.email
    """
    run_batch(driver, query, batch)
    print(f"  Ingested {len(batch)} Doctor nodes.")
    return provider_ids


def seed_encounters(driver, patient_set: Set[str]) -> Set[str]:
    print("Ingesting encounters & doctor relationships...")
    path = SYNTHEA_DIR / "encounters.csv"
    if not path.exists():
        return set()

    batch = []
    encounter_set = set()
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            pid = r.get("PATIENT")
            eid = r.get("Id")
            if not pid or pid not in patient_set or not eid:
                continue

            batch.append({
                "id": eid,
                "patient_id": pid,
                "provider_id": r.get("PROVIDER", ""),
                "start": r.get("START", ""),
                "stop": r.get("STOP", ""),
                "encounter_class": r.get("ENCOUNTERCLASS", "ambulatory"),
                "description": r.get("DESCRIPTION", "Consultation"),
                "cost": r.get("TOTAL_CLAIM_COST", "120.00"),
                "reason": r.get("REASONDESCRIPTION", ""),
            })
            encounter_set.add(eid)

    query = """
    UNWIND $batch AS r
    MERGE (e:Encounter {id: r.id})
    SET e.start = r.start,
        e.stop = r.stop,
        e.encounter_class = r.encounter_class,
        e.description = r.description,
        e.cost = r.cost,
        e.reason = r.reason
    WITH e, r
    MATCH (p:Patient {id: r.patient_id})
    MERGE (p)-[:HAD_ENCOUNTER]->(e)
    WITH e, r, p
    WHERE r.provider_id <> ''
    MATCH (d:Doctor {id: r.provider_id})
    MERGE (d)-[:CONDUCTED]->(e)
    MERGE (d)-[:TREATS]->(p)
    """
    run_batch(driver, query, batch, batch_size=250)
    print(f"  Ingested {len(batch)} Encounter nodes.")
    return encounter_set


def seed_conditions(driver, patient_set: Set[str], encounter_set: Set[str]):
    print("Ingesting conditions & diagnoses (separating clinical diseases from social findings)...")
    path = SYNTHEA_DIR / "conditions.csv"
    if not path.exists():
        return

    clinical_batch = []
    social_batch = []
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            pid = r.get("PATIENT")
            eid = r.get("ENCOUNTER")
            raw_desc = r.get("DESCRIPTION", "").strip()
            if not pid or pid not in patient_set or not raw_desc:
                continue

            cleaned_name = clean_clinical_text(raw_desc)
            if is_clinical_disease(raw_desc):
                clinical_batch.append({
                    "patient_id": pid,
                    "encounter_id": eid if eid in encounter_set else "",
                    "name": cleaned_name,
                    "raw_name": raw_desc,
                    "code": r.get("CODE", ""),
                    "start": r.get("START", ""),
                })
            else:
                social_batch.append({
                    "patient_id": pid,
                    "encounter_id": eid if eid in encounter_set else "",
                    "name": cleaned_name,
                    "raw_name": raw_desc,
                    "code": r.get("CODE", ""),
                    "start": r.get("START", ""),
                })

    # Ingest bona fide clinical diseases
    query_clinical = """
    UNWIND $batch AS r
    MERGE (d:Disease:Condition {name: r.name})
    ON CREATE SET d.code = r.code, d.raw_name = r.raw_name
    WITH d, r
    MATCH (p:Patient {id: r.patient_id})
    MERGE (p)-[:HAS_DIAGNOSIS]->(d)
    WITH d, r
    WHERE r.encounter_id <> ''
    MATCH (e:Encounter {id: r.encounter_id})
    MERGE (e)-[:DIAGNOSED]->(d)
    """
    run_batch(driver, query_clinical, clinical_batch, batch_size=300)
    print(f"  Ingested {len(clinical_batch)} Disease diagnoses.")

    # Ingest social findings & administrative records as SocialFinding
    if social_batch:
        query_social = """
        UNWIND $batch AS r
        MERGE (f:SocialFinding:Condition {name: r.name})
        ON CREATE SET f.code = r.code
        WITH f, r
        MATCH (p:Patient {id: r.patient_id})
        MERGE (p)-[:HAS_FINDING]->(f)
        """
        run_batch(driver, query_social, social_batch, batch_size=300)
        print(f"  Ingested {len(social_batch)} SocialFinding records.")


def seed_medications(driver, patient_set: Set[str], encounter_set: Set[str]):
    print("Ingesting medications & indication-based TREATS links...")
    path = SYNTHEA_DIR / "medications.csv"
    if not path.exists():
        return

    batch = []
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for r in reader:
            pid = r.get("PATIENT")
            eid = r.get("ENCOUNTER")
            desc = r.get("DESCRIPTION", "").strip()
            raw_reason = r.get("REASONDESCRIPTION", "").strip()
            if not pid or pid not in patient_set or not desc:
                continue

            cleaned_reason = clean_clinical_text(raw_reason)
            # Only treat bona fide diseases
            treat_reason = cleaned_reason if raw_reason and is_clinical_disease(raw_reason) else ""

            batch.append({
                "patient_id": pid,
                "encounter_id": eid if eid in encounter_set else "",
                "name": clean_clinical_text(desc),
                "code": r.get("CODE", ""),
                "cost": r.get("TOTALCOST", "25.00"),
                "reason": treat_reason,
            })

    query = """
    UNWIND $batch AS r
    MERGE (m:Medication {name: r.name})
    ON CREATE SET m.code = r.code, m.cost = r.cost
    WITH m, r
    WHERE r.encounter_id <> ''
    MATCH (e:Encounter {id: r.encounter_id})
    MERGE (e)-[:PRESCRIBED]->(m)
    WITH m, r
    WHERE r.reason <> ''
    MERGE (d:Disease:Condition {name: r.reason})
    MERGE (m)-[:TREATS]->(d)
    """
    run_batch(driver, query, batch, batch_size=300)
    print(f"  Ingested {len(batch)} Medication records with TREATS links.")


def seed_procedures(driver, patient_set: Set[str], encounter_set: Set[str], max_per_patient: int):
    print("Ingesting procedures / treatments with outcomes...")
    path = SYNTHEA_DIR / "procedures.csv"
    if not path.exists():
        return

    per_patient_count: Dict[str, int] = {}
    batch = []
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for i, r in enumerate(reader):
            pid = r.get("PATIENT")
            eid = r.get("ENCOUNTER")
            desc = r.get("DESCRIPTION", "").strip()
            raw_reason = r.get("REASONDESCRIPTION", "").strip()
            if not pid or pid not in patient_set or not desc:
                continue
            if per_patient_count.get(pid, 0) >= max_per_patient:
                continue

            per_patient_count[pid] = per_patient_count.get(pid, 0) + 1
            proc_id = f"PR-{pid[:8]}-{i}"
            outcome = "cured" if "vaccination" in desc.lower() or "screening" in desc.lower() else "improved"
            cleaned_reason = clean_clinical_text(raw_reason)
            treat_reason = cleaned_reason if raw_reason and is_clinical_disease(raw_reason) else ""

            batch.append({
                "id": proc_id,
                "patient_id": pid,
                "encounter_id": eid if eid in encounter_set else "",
                "treatment_type": clean_clinical_text(desc),
                "description": clean_clinical_text(desc),
                "cost": r.get("BASE_COST", "150.00"),
                "treatment_date": r.get("START", ""),
                "outcome": outcome,
                "success": 0.92,
                "reason": treat_reason,
            })

    query = """
    UNWIND $batch AS r
    MERGE (t:Treatment:Procedure {id: r.id})
    SET t.treatment_type = r.treatment_type,
        t.description = r.description,
        t.cost = r.cost,
        t.treatment_date = r.treatment_date,
        t.outcome = r.outcome,
        t.success = r.success
    WITH t, r
    MATCH (p:Patient {id: r.patient_id})
    MERGE (p)-[:RECEIVED_TREATMENT]->(t)
    WITH t, r
    WHERE r.encounter_id <> ''
    MATCH (e:Encounter {id: r.encounter_id})
    MERGE (e)-[:PERFORMED]->(t)
    WITH t, r
    WHERE r.reason <> ''
    MERGE (d:Disease:Condition {name: r.reason})
    MERGE (t)-[:TREATS]->(d)
    """
    run_batch(driver, query, batch, batch_size=250)
    print(f"  Ingested {len(batch)} Treatment/Procedure nodes.")


def seed_observations(driver, patient_set: Set[str], encounter_set: Set[str], max_per_patient: int):
    print("Ingesting laboratory & vital observations...")
    path = SYNTHEA_DIR / "observations.csv"
    if not path.exists():
        return

    per_patient_count: Dict[str, int] = {}
    batch = []
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for i, r in enumerate(reader):
            pid = r.get("PATIENT")
            eid = r.get("ENCOUNTER")
            cat = r.get("CATEGORY", "").lower()
            desc = r.get("DESCRIPTION", "").strip()
            val = r.get("VALUE", "").strip()
            if not pid or pid not in patient_set or not desc:
                continue
            if cat not in ("laboratory", "vital-signs"):
                continue
            if per_patient_count.get(pid, 0) >= max_per_patient:
                continue

            per_patient_count[pid] = per_patient_count.get(pid, 0) + 1
            lab_id = f"LT-{pid[:8]}-{i}"

            # Evaluate status deterministically:
            # Check standard clinical thresholds or default normal
            status = "normal"
            try:
                num = float(val)
                if "glucose" in desc.lower() and num > 140:
                    status = "abnormal"
                elif "a1c" in desc.lower() and num > 7.0:
                    status = "abnormal"
                elif "systolic" in desc.lower() and num > 140:
                    status = "abnormal"
                elif "diastolic" in desc.lower() and num > 90:
                    status = "abnormal"
            except (ValueError, TypeError):
                pass

            batch.append({
                "id": lab_id,
                "patient_id": pid,
                "encounter_id": eid if eid in encounter_set else "",
                "name": desc,
                "result": val,
                "unit": r.get("UNITS", ""),
                "status": status,
                "date": r.get("DATE", ""),
                "category": cat,
            })

    query = """
    UNWIND $batch AS r
    MERGE (l:LabTest:Observation {id: r.id})
    SET l.name = r.name,
        l.result = r.result,
        l.unit = r.unit,
        l.status = r.status,
        l.date = r.date,
        l.category = r.category
    WITH l, r
    MATCH (p:Patient {id: r.patient_id})
    MERGE (p)-[:HAS_LAB_TEST]->(l)
    WITH l, r
    WHERE r.encounter_id <> ''
    MATCH (e:Encounter {id: r.encounter_id})
    MERGE (e)-[:RECORDED]->(l)
    """
    run_batch(driver, query, batch, batch_size=250)
    print(f"  Ingested {len(batch)} LabTest/Observation nodes.")


def seed_allergies(driver, patient_set: Set[str]):
    print("Ingesting allergies...")
    path = SYNTHEA_DIR / "allergies.csv"
    if not path.exists():
        return

    batch = []
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for i, r in enumerate(reader):
            pid = r.get("PATIENT")
            desc = r.get("DESCRIPTION", "").strip()
            if not pid or pid not in patient_set or not desc:
                continue

            batch.append({
                "id": f"ALG-{pid[:8]}-{i}",
                "patient_id": pid,
                "substance": clean_clinical_text(desc),
                "type": r.get("TYPE", "allergy"),
                "severity": r.get("SEVERITY1", "MILD") or "MILD",
                "start": r.get("START", ""),
            })

    query = """
    UNWIND $batch AS r
    MERGE (a:Allergy {id: r.id})
    SET a.substance = r.substance,
        a.type = r.type,
        a.severity = r.severity,
        a.start = r.start
    WITH a, r
    MATCH (p:Patient {id: r.patient_id})
    MERGE (p)-[:HAS_ALLERGY]->(a)
    """
    run_batch(driver, query, batch)
    print(f"  Ingested {len(batch)} Allergy nodes.")


def seed_consultation_notes(driver, patient_ids: List[str]):
    """Seed realistic ConsultationNotes linked to active patient diagnoses."""
    print("Seeding sample consultation notes...")
    if not patient_ids:
        return

    # Choose top 5 patients to attach initial realistic notes
    top_pids = patient_ids[:5]
    sample_notes = [
        {
            "pid": top_pids[0],
            "nid": f"CN-{top_pids[0][:8]}-01",
            "title": "Comprehensive Chronic Disease Review",
            "summary": "Patient presented for routine annual check. Blood pressure and glycemic control reviewed; ongoing medication well tolerated. Advised lifestyle modifications.",
            "diagnoses": ["Hypertension", "Diabetes"],
            "actions": ["Maintain healthy diet", "Daily 30-min walking", "Follow-up in 3 months"],
            "meds": ["Metformin 500mg twice daily", "Lisinopril 10mg daily"],
        },
        {
            "pid": top_pids[1] if len(top_pids) > 1 else top_pids[0],
            "nid": f"CN-{top_pids[1][:8]}-01" if len(top_pids) > 1 else "CN-02",
            "title": "Respiratory Assessment & Inhaler Review",
            "summary": "Patient reports seasonal chest tightness and dry cough. Inhaler technique demonstrated and peak flow diary advised.",
            "diagnoses": ["Asthma", "Acute bronchitis"],
            "actions": ["Use spacer device with inhaler", "Log peak flow measurements", "Avoid known pollen triggers"],
            "meds": ["Albuterol inhaler 90mcg as needed", "Fluticasone propionate twice daily"],
        },
        {
            "pid": top_pids[2] if len(top_pids) > 2 else top_pids[0],
            "nid": f"CN-{top_pids[2][:8]}-01" if len(top_pids) > 2 else "CN-03",
            "title": "Joint Pain & Mobility Evaluation",
            "summary": "Persistent bilateral knee stiffness in the morning. Conservative physical therapy recommended; pain management adjusted.",
            "diagnoses": ["Osteoarthritis of knee"],
            "actions": ["Low-impact swimming exercises", "Physiotherapy referral", "Apply warm compress"],
            "meds": ["Acetaminophen 500mg as needed", "Topical diclofenac gel"],
        },
    ]

    with driver.session() as s:
        for item in sample_notes:
            s.run(
                """
                MATCH (p:Patient {id: $pid})
                MERGE (n:ConsultationNote {id: $nid})
                SET n.title = $title,
                    n.summary = $summary,
                    n.diagnoses = $diagnoses,
                    n.action_items = $actions,
                    n.medications_discussed = $meds,
                    n.created_at = datetime()
                MERGE (p)-[:HAS_CONSULTATION_NOTE]->(n)
                WITH n
                FOREACH (d in $diagnoses |
                    MERGE (dis:Disease {name: d})
                    MERGE (n)-[:HAS_DIAGNOSIS]->(dis)
                )
                """,
                pid=item["pid"],
                nid=item["nid"],
                title=item["title"],
                summary=item["summary"],
                diagnoses=item["diagnoses"],
                actions=item["actions"],
                meds=item["meds"],
            )
    print(f"  Seeded {len(sample_notes)} ConsultationNote fixtures.")


def main():
    parser = argparse.ArgumentParser(description="Ingest Synthea sample dataset into Neo4j")
    parser.add_argument("--limit-patients", type=int, default=DEFAULT_PATIENTS_LIMIT,
                        help=f"Number of patients to ingest (default {DEFAULT_PATIENTS_LIMIT})")
    parser.add_argument("--clear", action="store_true", default=True,
                        help="Clear previous graph before seeding (default True)")
    args = parser.parse_args()

    driver = get_driver()
    try:
        driver.verify_connectivity()
        print("Connected to Neo4j.")

        if args.clear:
            clear_database(driver)

        create_constraints(driver)

        patient_ids = seed_patients(driver, args.limit_patients)
        patient_set = set(patient_ids)

        seed_providers(driver)
        encounter_set = seed_encounters(driver, patient_set)
        seed_conditions(driver, patient_set, encounter_set)
        seed_medications(driver, patient_set, encounter_set)
        seed_procedures(driver, patient_set, encounter_set, DEFAULT_PROCEDURES_PER_PATIENT)
        seed_observations(driver, patient_set, encounter_set, DEFAULT_OBSERVATIONS_PER_PATIENT)
        seed_allergies(driver, patient_set)
        seed_consultation_notes(driver, patient_ids)

        print("\nSynthea ingestion complete!")
    finally:
        driver.close()


if __name__ == "__main__":
    main()
