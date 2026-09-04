#!/usr/bin/env python3
"""MediGraph data seeder.

Populates the configured Neo4j AuraDB instance with a hybrid demo dataset:
  - curated real diseases + symptoms (Disease/HAS_SYMPTOM/Symptom)
  - patients/doctors/treatments/lab tests from the CSVs under data/
  - a sample of medications from medicine_dataset.csv
  - patient<->disease, patient<->treatment, medication<->disease links
  - a few example ConsultationNote records attached to seeded patients
  - SIMILAR_TO edges between patients in the same cohort (shared diagnosis)

The script is idempotent: natural-key MERGEs mean re-running will not silently
duplicate the dataset. Run from the project root:

    .venv/bin/python -m backend.scripts.seed [--med-medications 250]

Reads NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD from the environment (see .env).
"""
import argparse
import csv
import os
import random
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"

# Row limits so we don't ingest hundreds of thousands of rows.
LIMIT = {
    "patients": 50,
    "doctors": 10,
    "treatments": 200,
    "lab_tests": 200,
    "medications": 500,
}

# deterministic-ish seed usage for reproducible demo links
_rand = random.Random(42)


# ---------------------------------------------------------------------------
# Curated medical vocabulary (real diseases + characteristic symptoms)
# ---------------------------------------------------------------------------
DISEASES = {
    "Hypertension": ["headache", "dizziness", "blurred vision", "palpitations", "nosebleed"],
    "Type 2 Diabetes": ["increased thirst", "frequent urination", "fatigue", "blurred vision", "slow healing wounds"],
    "Asthma": ["shortness of breath", "wheezing", "chest tightness", "chronic cough", "difficulty breathing"],
    "Community-Acquired Pneumonia": ["fever", "productive cough", "chills", "chest pain", "rapid breathing"],
    "Urinary Tract Infection": ["burning urination", "frequent urination", "lower abdominal pain", "foul-smelling urine", "blood in urine"],
    "Gastroesophageal Reflux Disease": ["heartburn", "regurgitation", "chest discomfort", "chronic cough", "sore throat"],
    "Migraine": ["throbbing headache", "nausea", "photophobia", "blurred vision", "vomiting"],
    "Osteoarthritis": ["joint pain", "joint stiffness", "joint swelling", "reduced mobility", "knee pain"],
    "Iron Deficiency Anemia": ["fatigue", "pallor", "shortness of breath on exertion", "dizziness", "cold intolerance"],
    "Hypothyroidism": ["fatigue", "weight gain", "cold intolerance", "dry skin", "constipation"],
    "Major Depressive Disorder": ["persistent sadness", "loss of interest", "fatigue", "insomnia", "low self-esteem"],
    "Generalized Anxiety Disorder": ["restlessness", "palpitations", "insomnia", "difficulty concentrating", "muscle tension"],
    "Chronic Obstructive Pulmonary Disease": ["shortness of breath", "chronic cough", "wheezing", "increased sputum", "chest tightness"],
    "Coronary Artery Disease": ["chest pain", "shortness of breath", "palpitations", "fatigue", "dizziness"],
    "Acute Bronchitis": ["productive cough", "chest discomfort", "fatigue", "low grade fever", "wheezing"],
    "Tonsillitis": ["sore throat", "swallowing difficulty", "fever", "swollen tonsils", "enlarged neck lymph nodes"],
    "Otitis Media": ["ear pain", "fever", "hearing difficulty", "ear drainage", "irritability"],
    "Allergic Rhinitis": ["sneezing", "nasal congestion", "itchy eyes", "runny nose", "post-nasal drip"],
    "Atopic Dermatitis": ["itchy skin", "skin rash", "dry skin", "skin lesion", "skin swelling"],
    "Psoriasis": ["scaly skin patches", "skin itch", "skin lesion", "skin redness", "dry or flaky scalp"],
    "Rheumatoid Arthritis": ["joint pain", "joint stiffness", "joint swelling", "fatigue", "morning stiffness"],
    "Dyspepsia": ["upper abdominal pain", "bloating", "early satiety", "nausea", "heartburn"],
    "Irritable Bowel Syndrome": ["abdominal pain", "bloating", "diarrhea", "constipation", "gas"],
    "Chronic Kidney Disease": ["fatigue", "swelling of legs", "decreased urine output", "shortness of breath", "loss of appetite"],
    "Hepatitis B": ["jaundice", "fatigue", "abdominal pain", "nausea", "dark urine"],
    "Tuberculosis": ["chronic cough", "night sweats", "weight loss", "hemoptysis", "fever"],
    "Malaria": ["fever", "chills", "sweating", "headache", "vomiting"],
    "Dengue Fever": ["high fever", "severe headache", "joint pain", "rash", "muscle pain"],
    "Measles": ["fever", "cough", "coryza", "conjunctivitis", "body rash"],
    "Chickenpox": ["itchy blister rash", "fever", "fatigue", "headache", "loss of appetite"],
    "Scabies": ["severe itching", "skin rash", "burrow tracks", "skin lesion", "itch worse at night"],
    "Tinea (Ringworm)": ["ring-shaped rash", "skin itch", "skin scaling", "skin redness", "skin lesion"],
    "Candidiasis": ["itchy skin", "white discharge", "skin redness", "irritation", "burning sensation"],
    "Bacterial Sinusitis": ["facial pressure", "nasal congestion", "headache", "thick nasal discharge", "cough"],
    "Conjunctivitis": ["eye redness", "eye discharge", "itchy eyes", "burning eyes", "watery eyes"],
    "Cataract": ["blurred vision", "glare sensitivity", "poor night vision", "fading colors", "frequent prescription changes"],
    "Glaucoma": ["eye pain", "blurred vision", "halos around lights", "eye redness", "loss of peripheral vision"],
    "Eczema": ["itchy skin", "skin redness", "dry patches", "skin thickening", "oozing lesions"],
    "Urticaria (Hives)": ["itchy welts", "skin rash", "skin swelling", "red raised bumps", "angioedema"],
    "Acne Vulgaris": ["pimples", "acne or pimples", "oily skin", "blackheads", "skin lesion"],
    "Rosacea": ["facial redness", "visible blood vessels", "pustules", "burning face", "flushing"],
    "Vitiligo": ["depigmented patches", "white patches on skin", "skin color loss", "premature graying", "eyelid discoloration"],
    "Alopecia Areata": ["patchy hair loss", "scalp bald patch", "nail pitting", "scalp tenderness", "recurrent hair loss"],
    "Seborrheic Dermatitis": ["dandruff", "itchy scalp", "flaky scalp skin", "skin redness", "greasy scales"],
    "Osteoporosis": ["low back pain", "bone pain", "loss of height", "stooped posture", "bone fractures"],
    "Gout": ["joint pain", "toe pain", "joint swelling", "joint warmth", "redness over joint"],
    "Epilepsy": ["seizures", "uncontrolled jerking", "loss of consciousness", "staring spells", "confusion"],
    "Parkinson's Disease": ["tremor", "slow movement", "muscle rigidity", "postural instability", "masked face"],
    "Alzheimer's Disease": ["memory loss", "disorientation", "difficulty with tasks", "mood changes", "confusion"],
    "Strep Throat": ["sore throat", "difficulty swallowing", "fever", "red swollen tonsils", "enlarged lymph nodes"],
    "Varicose Veins": ["leg swelling", "leg pain", "heavy legs", "itchy legs", "skin discoloration"],
    "Deep Vein Thrombosis": ["leg swelling", "leg pain", "calf tenderness", "leg warmth", "redness"],
    "Cellulitis": ["skin redness", "skin warmth", "swelling", "pain", "fever"],
    "Fungal Nail Infection": ["thickened nail", "discolored nail", "brittle nail", "nail distortion", "foul odor"],
    "Renal Colic (Kidney Stone)": ["severe flank pain", "blood in urine", "nausea", "vomiting", "painful urination"],
    "Gallstones": ["right upper abdominal pain", "nausea", "vomiting", "biliary colic", "fatty food intolerance"],
    "Cystitis": ["burning urination", "frequent urination", "pelvic pressure", "lower abdominal discomfort", "blood in urine"],
    "Prostatitis": ["pelvic pain", "painful urination", "frequent urination", "urinary urgency", "lower back pain"],
    "Menopause": ["hot flashes", "night sweats", "irregular periods", "mood changes", "insomnia"],
}

# Medication name keyword -> disease name it treats (curated, real pairings).
MEDICATION_INDICATION_MAP = [
    ("amlodipine", "Hypertension"),
    ("enalapril", "Hypertension"),
    ("metformin", "Type 2 Diabetes"),
    ("insulin", "Type 2 Diabetes"),
    ("glipizide", "Type 2 Diabetes"),
    ("salbutamol", "Asthma"),
    ("budesonide", "Asthma"),
    ("montelukast", "Asthma"),
    ("amoxicillin", "Community-Acquired Pneumonia"),
    ("clarithromycin", "Community-Acquired Pneumonia"),
    ("azithromycin", "Community-Acquired Pneumonia"),
    ("ciprofloxacin", "Urinary Tract Infection"),
    ("nitrofurantoin", "Urinary Tract Infection"),
    ("trimethoprim", "Urinary Tract Infection"),
    ("omeprazole", "Gastroesophageal Reflux Disease"),
    ("lansoprazole", "Gastroesophageal Reflux Disease"),
    ("pantoprazole", "Gastroesophageal Reflux Disease"),
    ("sumatriptan", "Migraine"),
    ("propranolol", "Migraine"),
    ("paracetamol", "Migraine"),
    ("ibuprofen", "Osteoarthritis"),
    ("diclofenac", "Osteoarthritis"),
    ("ferrous", "Iron Deficiency Anemia"),
    ("iron", "Iron Deficiency Anemia"),
    ("levothyroxine", "Hypothyroidism"),
    ("sertraline", "Major Depressive Disorder"),
    ("escitalopram", "Major Depressive Disorder"),
    ("fluoxetine", "Major Depressive Disorder"),
    ("diazepam", "Generalized Anxiety Disorder"),
    ("alprazolam", "Generalized Anxiety Disorder"),
    ("budesonide", "Chronic Obstructive Pulmonary Disease"),
    ("theophylline", "Chronic Obstructive Pulmonary Disease"),
    ("tiotropium", "Chronic Obstructive Pulmonary Disease"),
    ("atorvastatin", "Coronary Artery Disease"),
    ("rosuvastatin", "Coronary Artery Disease"),
    ("aspirin", "Coronary Artery Disease"),
    ("clopidogrel", "Coronary Artery Disease"),
    ("gabapentin", "Osteoarthritis"),
    ("penicillin", "Tonsillitis"),
    ("cephalexin", "Tonsillitis"),
    ("cetirizine", "Allergic Rhinitis"),
    ("loratadine", "Allergic Rhinitis"),
    ("fexofenadine", "Allergic Rhinitis"),
    ("hydrocortisone", "Atopic Dermatitis"),
    ("betamethasone", "Atopic Dermatitis"),
    ("methotrexate", "Psoriasis"),
    ("prednisolone", "Rheumatoid Arthritis"),
    ("methotrexate", "Rheumatoid Arthritis"),
    ("ranitidine", "Dyspepsia"),
    ("famotidine", "Dyspepsia"),
    ("loperamide", "Irritable Bowel Syndrome"),
    ("mebeverine", "Irritable Bowel Syndrome"),
    ("ticagrelor", "Coronary Artery Disease"),
    ("warfarin", "Deep Vein Thrombosis"),
    ("rivaroxaban", "Deep Vein Thrombosis"),
    ("clotrimazole", "Candidiasis"),
    ("fluconazole", "Candidiasis"),
    ("acyclovir", "Chickenpox"),
    ("permethrin", "Scabies"),
    ("carbamazepine", "Epilepsy"),
    ("levetiracetam", "Epilepsy"),
    ("levodopa", "Parkinson's Disease"),
    ("donepezil", "Alzheimer's Disease"),
    ("memantine", "Alzheimer's Disease"),
    ("allopurinol", "Gout"),
    ("colchicine", "Gout"),
    ("calcium", "Osteoporosis"),
    ("alendronate", "Osteoporosis"),
    ("vitamin d", "Osteoporosis"),
    ("domperidone", "Dyspepsia"),
    ("ondansetron", "Dyspepsia"),
    ("pregabalin", "Osteoarthritis"),
    ("tramadol", "Osteoarthritis"),
    ("codeine", "Osteoarthritis"),
    ("doxycycline", "Acne Vulgaris"),
    ("isotretinoin", "Acne Vulgaris"),
    ("metronidazole", "Cellulitis"),
    ("dicloxacillin", "Cellulitis"),
    ("naproxen", "Gout"),
]

# Sample ConsultationNote fixtures per patient id -> patient id + note payload
# (kept intentionally "very few" per the product decision).
CONSULTATION_NOTES = [
    {
        "patient_id": "P001",
        "note_id": "CN-P001-001",
        "title": "New-onset hypertension review",
        "summary": "58-year-old male, elevated BP readings over three visits. Lifestyle risk factors present; started on medication.",
        "diagnoses": ["Hypertension"],
        "action_items": ["Monitor BP twice weekly", "Reduce salt intake", "Return in 4 weeks"],
        "medications_discussed": ["amlodipine 5 mg daily - prescribed for hypertension"],
        "created_at_days_ago": 5,
    },
    {
        "patient_id": "P004",
        "note_id": "CN-P004-001",
        "title": "Worsening asthma control",
        "summary": "Adult with poorly controlled asthma; frequent reliever use. Advised inhaler technique review and controller up-titration.",
        "diagnoses": ["Asthma"],
        "action_items": ["Review inhaler technique", "Start controller medication", "Peak flow diary"],
        "medications_discussed": ["budesonide-formoterol inhaler twice daily - for asthma control", "salbutamol inhaler as needed - reliever"],
        "created_at_days_ago": 3,
    },
    {
        "patient_id": "P010",
        "note_id": "CN-P010-001",
        "title": "Diabetes annual check",
        "summary": "Type 2 diabetes patient, stable HbA1c. Reinforced diet/exercise; medication unchanged.",
        "diagnoses": ["Type 2 Diabetes"],
        "action_items": ["Maintain diet and exercise", "Repeat HbA1c in 3 months", "Yearly retinal screen"],
        "medications_discussed": ["metformin 1000 mg twice daily - for diabetes"],
        "created_at_days_ago": 9,
    },
    {
        "patient_id": "P015",
        "note_id": "CN-P015-001",
        "title": "Consultation for recurrent headaches",
        "summary": "Patient reports frequent migraines triggered by stress. Prevention discussed and abortive therapy provided.",
        "diagnoses": ["Migraine"],
        "action_items": ["Track headache diary", "Identify triggers", "Return if attacks worsen"],
        "medications_discussed": ["sumatriptan 50 mg at onset - for migraine attacks", "propranolol 40 mg daily - preventive"],
        "created_at_days_ago": 1,
    },
    {
        "patient_id": "P022",
        "note_id": "CN-P022-001",
        "title": "Joint pain management",
        "summary": "Osteoarthritis affecting knees. Conservative measures discussed; analgesia prescribed and physio recommended.",
        "diagnoses": ["Osteoarthritis"],
        "action_items": ["Daily range-of-motion exercises", "Weight management", "Physiotherapy referral"],
        "medications_discussed": ["paracetamol 500 mg as needed - for pain", "ibuprofen 400 mg as needed - for inflammation"],
        "created_at_days_ago": 7,
    },
]


def _read_csv(name, limit):
    path = DATA_DIR / name
    if not path.exists():
        print(f"  ! missing {name} — skipping")
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = []
        for row in reader:
            if len(rows) >= limit:
                break
            rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _mk_timestamp(days_ago):
    """Return an ISO 8601 datetime `days_ago` days back from now (UTC)."""
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


def _run(driver, cypher, **params):
    with driver.session() as session:
        session.run(cypher, **params)


def _map_medication_to_disease(med_name, classif, indication):
    """Return a disease name for a medication, or None.

    Primary signal is the medication's Indication column (clean values like
    Pain/Diabetes/Fungus/Infection...). Falls back to a real-drug-name keyword
    map for more specific pairings when the indication is unhelpful/generic.
    """
    ind_low = (indication or "").strip().lower()
    indication_disease = {
        "pain": "Osteoarthritis",
        "diabetes": "Type 2 Diabetes",
        "wound": "Cellulitis",
        "fever": "Malaria",
        "fungus": "Candidiasis",
        "depression": "Major Depressive Disorder",
        "virus": "Dengue Fever",
        "infection": "Community-Acquired Pneumonia",
    }
    if ind_low in indication_disease:
        return indication_disease[ind_low]

    name_low = med_name.lower()
    for keyword, disease in MEDICATION_INDICATION_MAP:
        if keyword in name_low:
            return disease
    return None


# ---------------------------------------------------------------------------
# Seed sections
# ---------------------------------------------------------------------------
def seed_diseases(driver):
    print("[diseases]")
    for disease, symptoms in DISEASES.items():
        _run(driver,
            "MERGE (d:Disease {name: $name})",
            name=disease)
        for sym in symptoms:
            _run(driver,
                "MERGE (s:Symptom {name: $sym}) "
                "WITH s MATCH (d:Disease {name: $disease}) "
                "MERGE (d)-[:HAS_SYMPTOM]->(s)",
                sym=sym, disease=disease)
    print(f"  seeded {len(DISEASES)} diseases")


def seed_patients(driver):
    print("[patients]")
    rows = _read_csv("patients.csv", LIMIT["patients"])
    count = 0
    for r in rows:
        pid = r.get("patient_id")
        if not pid:
            continue
        _run(driver,
            """
            MERGE (p:Patient {id: $id})
            SET p.first_name = $first, p.last_name = $last, p.gender = $gender,
                p.date_of_birth = $dob, p.contact_number = $phone,
                p.address = $address, p.registration_date = $reg,
                p.insurance_provider = $insurance, p.insurance_number = $ins_no,
                p.email = $email
            """,
            id=pid, first=r.get("first_name",""), last=r.get("last_name",""),
            gender=r.get("gender",""), dob=r.get("date_of_birth",""),
            phone=r.get("contact_number",""), address=r.get("address",""),
            reg=r.get("registration_date",""), insurance=r.get("insurance_provider",""),
            ins_no=r.get("insurance_number",""), email=r.get("email",""))
        count += 1

    _assign_diagnoses(driver)
    print(f"  seeded {count} patients + diagnoses")


def _assign_diagnoses(driver):
    """Deterministically give each patient 1-3 curated diagnoses, and link
    those diagnoses to the related symptoms, so graph views show a connected
    patient. Also creates SIMILAR_TO edges among patients sharing a diagnosis."""
    rows = _read_csv("patients.csv", LIMIT["patients"])
    disease_names = list(DISEASES.keys())
    patients = [r["patient_id"] for r in rows if r.get("patient_id")]

    cohort = 0
    for i, pid in enumerate(patients):
        # deterministic diagnosis selection, anchored to the patient index
        _rand.seed(i)
        n_diag = _rand.randint(1, 3)
        diags = _rand.sample(disease_names, k=n_diag)
        for d in diags:
            _run(driver,
                "MATCH (p:Patient {id: $pid}) MERGE (dis:Disease {name: $name}) "
                "MERGE (p)-[:HAS_DIAGNOSIS]->(dis)",
                pid=pid, name=d)

        # cohort: group every ~6 patients -> SIMILAR_TO clique within group
        if i % 6 == 0:
            cohort += 1

    # SIMILAR_TO edges within each cohort (same diagnosis cohort)
    for c in range(1, cohort + 1):
        members = [p for i, p in enumerate(patients) if (i // 6) + 1 == c]
        for a in range(len(members)):
            for b in range(a + 1, len(members)):
                _run(driver,
                    "MATCH (a:Patient {id: $a}) MATCH (b:Patient {id: $b}) "
                    "MERGE (a)-[:SIMILAR_TO]->(b) MERGE (b)-[:SIMILAR_TO]->(a)",
                    a=members[a], b=members[b])


def seed_doctors(driver):
    print("[doctors]")
    rows = _read_csv("doctors.csv", LIMIT["doctors"])
    count = 0
    for r in rows:
        did = r.get("doctor_id")
        if not did:
            continue
        _run(driver,
            """
            MERGE (d:Doctor {id: $id})
            SET d.first_name = $first, d.last_name = $last,
                d.specialization = $spec, d.phone_number = $phone,
                d.years_experience = $years, d.hospital_branch = $branch,
                d.email = $email
            """,
            id=did, first=r.get("first_name",""), last=r.get("last_name",""),
            spec=r.get("specialization",""), phone=r.get("phone_number",""),
            years=r.get("years_experience",""), branch=r.get("hospital_branch",""),
            email=r.get("email",""))
        count += 1

    # link doctors to patients (TREATS) round-robin
    patients = [r["patient_id"] for r in _read_csv("patients.csv", LIMIT["patients"]) if r.get("patient_id")]
    doctors = [r["doctor_id"] for r in rows if r.get("doctor_id")]
    if doctors:
        for i, pid in enumerate(patients):
            doc = doctors[i % len(doctors)]
            _run(driver,
                "MATCH (d:Doctor {id: $doc}) MATCH (p:Patient {id: $pid}) MERGE (d)-[:TREATS]->(p)",
                doc=doc, pid=pid)
    print(f"  seeded {count} doctors + TREATS edges")


def seed_treatments(driver):
    print("[treatments]")
    rows = _read_csv("treatments.csv", LIMIT["treatments"])
    count = 0
    for r in rows:
        tid = r.get("treatment_id")
        if not tid:
            continue
        _run(driver,
            """
            MERGE (t:Treatment {id: $id})
            SET t.treatment_type = $type, t.description = $desc,
                t.cost = $cost, t.treatment_date = $date
            """,
            id=tid, type=r.get("treatment_type",""), desc=r.get("description",""),
            cost=r.get("cost",""), date=r.get("treatment_date",""))
        count += 1

    # link treatments to patients deterministically (RECEIVED_TREATMENT)
    patients = [r["patient_id"] for r in _read_csv("patients.csv", LIMIT["patients"]) if r.get("patient_id")]
    tids = [r["treatment_id"] for r in rows if r.get("treatment_id")]
    _rand.seed(7)
    for tid in tids:
        pid = _rand.choice(patients)
        _run(driver,
            "MATCH (p:Patient {id: $pid}) MATCH (t:Treatment {id: $tid}) "
            "MERGE (p)-[:RECEIVED_TREATMENT]->(t)",
            pid=pid, tid=tid)
    print(f"  seeded {count} treatments")


def seed_medications(driver):
    print("[medications]")
    rows = _read_csv("medicine_dataset.csv", LIMIT["medications"])
    count = 0
    linked = 0
    for r in rows:
        name = r.get("Name")
        if not name:
            continue
        _run(driver,
            """
            MERGE (m:Medication {name: $name})
            SET m.category = $category, m.dosage_form = $form,
                m.strength = $strength, m.manufacturer = $manufacturer,
                m.indication = $indication, m.classification = $classif
            """,
            name=name, category=r.get("Category",""), form=r.get("Dosage Form",""),
            strength=r.get("Strength",""), manufacturer=r.get("Manufacturer",""),
            indication=r.get("Indication",""), classif=r.get("Classification",""))
        count += 1

        disease = _map_medication_to_disease(name, r.get("Classification",""), r.get("Indication",""))
        if disease:
            _run(driver,
                "MATCH (m:Medication {name: $name}) MERGE (d:Disease {name: $disease}) "
                "MERGE (m)-[:TREATS]->(d)",
                name=name, disease=disease)
            linked += 1
    print(f"  seeded {count} medications, {linked} linked to diseases")


def seed_lab_tests(driver):
    print("[lab_tests]")
    rows = _read_csv("lab_test_results_public.csv", LIMIT["lab_tests"])
    count = 0
    patients = [r["patient_id"] for r in _read_csv("patients.csv", LIMIT["patients"]) if r.get("patient_id")]
    _rand.seed(11)
    for i, r in enumerate(rows):
        tname = r.get("Test_Name")
        if not tname:
            continue
        tid = f"LT{i+1}"
        _run(driver,
            """
            MERGE (t:LabTest {id: $id})
            SET t.name = $name, t.result = $result, t.unit = $unit,
                t.reference_range = $range, t.status = $status,
                t.date = $date
            """,
            id=tid, name=tname, result=r.get("Result",""), unit=r.get("Unit",""),
            range=r.get("Reference_Range",""), status=r.get("Status",""),
            date=r.get("Date",""))
        # attach to a patient deterministically
        pid = patients[i % len(patients)] if patients else None
        if pid:
            _run(driver,
                "MATCH (p:Patient {id: $pid}) MATCH (t:LabTest {id: $tid}) "
                "MERGE (p)-[:HAS_LAB_TEST]->(t)",
                pid=pid, tid=tid)
        count += 1
    print(f"  seeded {count} lab tests")


def seed_consultation_notes(driver):
    print("[consultation_notes]")
    count = 0
    for fx in CONSULTATION_NOTES:
        pid = fx["patient_id"]
        nid = fx["note_id"]
        created = _mk_timestamp(fx["created_at_days_ago"])
        with driver.session() as session:
            rec = session.run(
                """
                MATCH (p:Patient {id: $pid})
                MERGE (n:ConsultationNote {id: $nid})
                SET n.title = $title, n.summary = $summary,
                    n.diagnoses = $diagnoses, n.action_items = $action_items,
                    n.medications_discussed = $meds, n.created_at = $created
                MERGE (p)-[:HAS_CONSULTATION_NOTE]->(n)
                RETURN p.id AS pid
                """,
                pid=pid, nid=nid, title=fx["title"], summary=fx["summary"],
                diagnoses=fx["diagnoses"], action_items=fx["action_items"],
                meds=fx["medications_discussed"], created=created,
            ).single()
        if rec is None:
            print(f"  ! patient {pid} not found — skipping note")
            continue
        # link note diagnoses to Disease nodes (Treatment Intelligence feed)
        for d in fx["diagnoses"]:
            _run(driver,
                "MATCH (n:ConsultationNote {id: $nid}) MERGE (dis:Disease {name: $name}) "
                "MERGE (n)-[:HAS_DIAGNOSIS]->(dis)",
                nid=nid, name=d)
        count += 1
    print(f"  seeded {count} consultation notes")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Seed MediGraph AuraDB with demo or Synthea data")
    parser.add_argument("--source", choices=["synthea", "legacy"], default="synthea",
                        help="Data source to ingest (synthea or legacy, default: synthea)")
    parser.add_argument("--limit-patients", type=int, default=60,
                        help="Patient count limit for synthea ingestion (default 60)")
    parser.add_argument("--med-medications", type=int, default=250,
                        help="max medication rows to ingest for legacy seed (default 250)")
    args = parser.parse_args()

    if args.source == "synthea":
        from . import synthea_seeder
        synthea_seeder.main()
        return

    LIMIT["medications"] = args.med_medications

    uri = os.environ.get("NEO4J_URI")
    user = os.environ.get("NEO4J_USER")
    password = os.environ.get("NEO4J_PASSWORD")
    if not (uri and user and password):
        raise SystemExit("NEO4J_URI/NEO4J_USER/NEO4J_PASSWORD must be set (load .env).")

    print("Connecting to", uri)
    driver = GraphDatabase.driver(uri, auth=(user, password))
    try:
        driver.verify_connectivity()
        print("connected.\n")
        seed_diseases(driver)
        seed_patients(driver)
        seed_doctors(driver)
        seed_treatments(driver)
        seed_medications(driver)
        seed_lab_tests(driver)
        seed_consultation_notes(driver)
        print("\nSeeding complete.")
    finally:
        driver.close()


if __name__ == "__main__":
    main()