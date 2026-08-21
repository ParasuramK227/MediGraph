"""Graph seeding: load synthetic dataset JSON into Neo4j.

All dates are converted to native `date` objects so Cypher temporal
comparisons (expiry checks, recency filters) work correctly.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from config import SYNTHETIC_DIR
from graph.schema import clear_graph, ensure_schema
from services.graph_service import run_many


def _load(filename: str) -> dict:
    return json.loads((SYNTHETIC_DIR / filename).read_text())


def _d(value):
    return date.fromisoformat(value) if value else None


def seed_all(reset: bool = True) -> dict:
    ontology = _load("ontology.json")
    clinical = _load("clinical.json")
    facilities = _load("facilities.json")
    supply = _load("supply_chain.json")
    inventory = _load("inventory.json")
    evidence = _load("evidence.json")

    if reset:
        ensure_schema()
        clear_graph()

    counts: dict[str, int] = {}

    def track(name: str, n: int) -> None:
        counts[name] = counts.get(name, 0) + n

    # -- nodes -------------------------------------------------------------
    counts["symptoms"] = run_many(
        "MERGE (n:Symptom {id: $id}) SET n.name = $name",
        [{"id": s["id"], "name": s["name"]} for s in ontology["symptoms"]])

    disease_rows = []
    for d in ontology["diseases"]:
        disease_rows.append({"id": d["id"], "name": d["name"], "category": d["category"],
                             "icd_code": d["icd_code"]})
    counts["diseases"] = run_many(
        "MERGE (n:Disease {id: $id}) SET n.name=$name, n.category=$category, n.icd_code=$icd_code",
        disease_rows)

    treatment_rows = [{"id": t["id"], "name": t["name"], "type": t["type"]}
                      for t in ontology["treatments"]]
    counts["treatments"] = run_many(
        "MERGE (n:Treatment {id: $id}) SET n.name=$name, n.type=$type", treatment_rows)

    med_rows = [{"id": m["id"], "name": m["name"], "generic_name": m["generic_name"],
                 "form": m["form"], "strength": m["strength"], "category": m["category"]}
                for m in ontology["medications"]]
    counts["medications"] = run_many(
        """MERGE (n:Medication {id: $id})
           SET n.name=$name, n.generic_name=$generic_name, n.form=$form,
               n.strength=$strength, n.category=$category""", med_rows)

    lab_rows = [{"id": l["id"], "name": l["name"], "unit": l["unit"],
                 "ref_low": l["ref_low"], "ref_high": l["ref_high"]}
                for l in ontology["labs"]]
    counts["labs"] = run_many(
        "MERGE (n:LabTest {id: $id}) SET n.name=$name, n.unit=$unit, "
        "n.ref_low=$ref_low, n.ref_high=$ref_high", lab_rows)

    counts["doctors"] = run_many(
        "MERGE (n:Doctor {id: $id}) SET n.name=$name, n.specialty=$specialty",
        [{"id": doc["id"], "name": doc["name"], "specialty": doc["specialty"]}
         for doc in clinical["doctors"]])

    patient_rows = [{"id": p["id"], "name": p["name"], "age": p["age"],
                     "gender": p["gender"], "blood_type": p["blood_type"],
                     "city": p["city"]} for p in clinical["patients"]]
    counts["patients"] = run_many(
        """MERGE (n:Patient {id: $id})
           SET n.name=$name, n.age=$age, n.gender=$gender,
               n.blood_type=$blood_type, n.city=$city""", patient_rows)

    facility_nodes = []
    for h in facilities["hospitals"]:
        facility_nodes.append(("Hospital", h))
    for ph in facilities["pharmacies"]:
        facility_nodes.append(("Pharmacy", ph))
    for w in facilities["warehouses"]:
        facility_nodes.append(("Warehouse", w))
    for label, f in facility_nodes:
        props = {"id": f["id"], "name": f["name"], "city": f["city"],
                 "latitude": f["latitude"], "longitude": f["longitude"]}
        if label == "Hospital":
            props["level"] = f.get("level")
        if label == "Warehouse":
            props["capacity_units"] = f.get("capacity_units")
        run_many(f"MERGE (n:{label} {{id: $id}}) SET n += $props",
                 [{"id": props["id"], "props": props}])
    counts["facilities"] = len(facility_nodes)

    counts["manufacturers"] = run_many(
        "MERGE (n:Manufacturer {id: $id}) SET n.name=$name, n.country=$country",
        [{"id": m["id"], "name": m["name"], "country": m["country"]}
         for m in supply["manufacturers"]])
    counts["suppliers"] = run_many(
        "MERGE (n:Supplier {id: $id}) SET n.name=$name, n.country=$country",
        [{"id": s["id"], "name": s["name"], "country": s["country"]}
         for s in supply["suppliers"]])
    counts["distributors"] = run_many(
        "MERGE (n:Distributor {id: $id}) SET n.name=$name, n.region=$region",
        [{"id": d["id"], "name": d["name"], "region": d["region"]}
         for d in supply["distributors"]])

    batch_rows = [{"id": b["id"], "batch_id": b["id"],
                   "manufacture_date": _d(b["manufacture_date"]),
                   "expiry_date": _d(b["expiry_date"]),
                   "quantity_initial": b["quantity_initial"]}
                  for b in supply["batches"]]
    counts["drug_batches"] = run_many(
        """MERGE (n:DrugBatch {id: $id})
           SET n.batch_id=$batch_id, n.manufacture_date=$manufacture_date,
               n.expiry_date=$expiry_date, n.quantity_initial=$quantity_initial""",
        batch_rows)

    record_rows = []
    for p in clinical["patients"]:
        for r in p["records"]:
            record_rows.append({"id": r["id"], "patient_id": r["patient_id"],
                                "record_type": r["record_type"],
                                "summary": r["summary"],
                                "recorded_at": _d(r["recorded_at"])})
    counts["medical_records"] = run_many(
        """MERGE (n:MedicalRecord {id: $id})
           SET n.patient_id=$patient_id, n.record_type=$record_type,
               n.summary=$summary, n.recorded_at=$recorded_at""", record_rows)

    study_rows = [{"id": s["id"], "title": s["title"], "journal": s["journal"],
                   "publication_date": _d(s["publication_date"]),
                   "sample_size": s["sample_size"], "phase": s["phase"],
                   "summary": s["summary"]} for s in evidence["studies"]]
    counts["studies"] = run_many(
        """MERGE (n:ClinicalStudy {id: $id})
           SET n.title=$title, n.journal=$journal,
               n.publication_date=$publication_date, n.sample_size=$sample_size,
               n.phase=$phase, n.summary=$summary""", study_rows)

    evidence_rows = [{"id": e["id"], "source": e["source"],
                      "evidence_type": e["evidence_type"],
                      "confidence": e["confidence"],
                      "publication_date": _d(e["publication_date"]),
                      "supports_treatment_id": e["supports_treatment_id"],
                      "summary": e["summary"]} for e in evidence["evidence"]]
    counts["evidence"] = run_many(
        """MERGE (n:Evidence {id: $id})
           SET n.source=$source, n.evidence_type=$evidence_type,
               n.confidence=$confidence, n.publication_date=$publication_date,
               n.supports_treatment_id=$supports_treatment_id, n.summary=$summary""",
        evidence_rows)

    # -- relationships -----------------------------------------------------
    symptom_index = {s["name"]: s["id"] for s in ontology["symptoms"]}
    has_symptom = []
    diagnosis_rels = []
    for p in clinical["patients"]:
        seen_symptoms = set()
        for d in p["diagnoses"]:
            disease_symptoms = next(x for x in ontology["diseases"]
                                    if x["id"] == d["disease_id"])["symptoms"]
            for sym in disease_symptoms:
                if sym not in seen_symptoms and sym in symptom_index:
                    seen_symptoms.add(sym)
                    has_symptom.append({"pid": p["id"], "sid": symptom_index[sym]})
            diagnosis_rels.append({"pid": p["id"], "did": d["disease_id"],
                                   "diagnosed_at": _d(d["diagnosed_at"]),
                                   "status": d["status"], "severity": d["severity"]})
    counts["HAS_SYMPTOM"] = run_many(
        "MATCH (p:Patient {id:$pid}), (s:Symptom {id:$sid}) "
        "MERGE (p)-[:HAS_SYMPTOM]->(s)", has_symptom)
    counts["HAS_DIAGNOSIS"] = run_many(
        "MATCH (p:Patient {id:$pid}), (d:Disease {id:$did}) "
        "MERGE (p)-[r:HAS_DIAGNOSIS]->(d) "
        "SET r.diagnosed_at=$diagnosed_at, r.status=$status, r.severity=$severity",
        diagnosis_rels)

    lab_index = {l["name"]: l["id"] for l in ontology["labs"]}
    lab_rels = []
    for p in clinical["patients"]:
        for lr in p["lab_results"]:
            lab_rels.append({"pid": p["id"], "lid": lab_index[lr["test"]],
                             "value": lr["value"], "flag": lr["flag"],
                             "tested_at": _d(lr["tested_at"])})
    counts["UNDERWENT_TEST"] = run_many(
        "MATCH (p:Patient {id:$pid}), (l:LabTest {id:$lid}) "
        "MERGE (p)-[r:UNDERWENT_TEST]->(l) "
        "SET r.value=$value, r.flag=$flag, r.tested_at=$tested_at", lab_rels)

    treatment_rels = []
    for p in clinical["patients"]:
        for t in p["treatments_received"]:
            treatment_rels.append({"pid": p["id"], "tid": t["treatment_id"],
                                   "outcome": t["outcome"],
                                   "started_at": _d(t["started_at"]),
                                   "duration_days": t["duration_days"],
                                   "doctor_id": t["doctor_id"]})
    counts["RECEIVED_TREATMENT"] = run_many(
        "MATCH (p:Patient {id:$pid}), (t:Treatment {id:$tid}) "
        "MERGE (p)-[r:RECEIVED_TREATMENT]->(t) "
        "SET r.outcome=$outcome, r.started_at=$started_at, "
            "r.duration_days=$duration_days, r.doctor_id=$doctor_id", treatment_rels)

    treated_by = []
    for d in ontology["diseases"]:
        for t in d["treatments"]:
            tid = next(x["id"] for x in ontology["treatments"] if x["name"] == t)
            treated_by.append({"did": d["id"], "tid": tid})
    counts["TREATED_BY"] = run_many(
        "MATCH (d:Disease {id:$did}), (t:Treatment {id:$tid}) "
        "MERGE (t)-[:EFFECTIVE_FOR]->(d)", treated_by)

    med_index = {m["name"]: m["id"] for m in ontology["medications"]}
    uses_med = []
    for t in ontology["treatments"]:
        for med_name in t["medications"]:
            uses_med.append({"tid": t["id"], "mid": med_index[med_name]})
    counts["USES_MEDICATION"] = run_many(
        "MATCH (t:Treatment {id:$tid}), (m:Medication {id:$mid}) "
        "MERGE (t)-[:USES_MEDICATION]->(m)", uses_med)

    counts["ALTERNATIVE_TO"] = run_many(
        "MATCH (a:Medication {id:$aid}), (b:Medication {id:$bid}) "
        "MERGE (a)-[:ALTERNATIVE_TO]->(b)",
        [{"aid": med_index[pair["source"]], "bid": med_index[pair["target"]]}
         for pair in ontology["alternatives"]])

    batch_med = [{"bid": b["id"], "mid": b["medication_id"]} for b in supply["batches"]]
    counts["HAS_BATCH"] = run_many(
        "MATCH (m:Medication {id:$mid}), (b:DrugBatch {id:$bid}) "
        "MERGE (m)-[:HAS_BATCH]->(b)", batch_med)

    counts["MANUFACTURED_BY"] = run_many(
        "MATCH (b:DrugBatch {id:$bid}), (man:Manufacturer {id:$mid}) "
        "MERGE (b)-[:MANUFACTURED_BY]->(man)",
        [{"bid": b["id"], "mid": b["manufacturer_id"]} for b in supply["batches"]])
    counts["SUPPLIED_BY"] = run_many(
        "MATCH (b:DrugBatch {id:$bid}), (s:Supplier {id:$sid}) "
        "MERGE (b)-[:SUPPLIED_BY]->(s)",
        [{"bid": b["id"], "sid": b["supplier_id"]} for b in supply["batches"]])
    counts["DISTRIBUTED_BY"] = run_many(
        "MATCH (b:DrugBatch {id:$bid}), (d:Distributor {id:$did}) "
        "MERGE (b)-[:DISTRIBUTED_BY]->(d)",
        [{"bid": b["id"], "did": b["distributor_id"]} for b in supply["batches"]])
    counts["STORED_AT"] = run_many(
        "MATCH (b:DrugBatch {id:$bid}), (w:Warehouse {id:$wid}) "
        "MERGE (b)-[r:STORED_AT]->(w) "
        "SET r.quantity=$quantity, r.arrived_at=$arrived_at",
        [{"bid": s["batch_id"], "wid": s["warehouse_id"],
          "quantity": s["quantity"], "arrived_at": _d(s["arrived_at"])}
         for s in supply["stored_at"]])
    counts["SUPPLIES"] = run_many(
        "MATCH (w:Warehouse {id:$wid}), (f {id:$fid}) "
        "MERGE (w)-[r:SUPPLIES]->(f) SET r.lead_time_days=$lead",
        [{"wid": s["warehouse_id"], "fid": s["facility_id"],
          "lead": s["lead_time_days"]} for s in supply["supplies"]])

    counts["HAS_INVENTORY"] = run_many(
        "MATCH (f {id:$fid}), (m:Medication {id:$mid}) "
        "MERGE (f)-[r:HAS_INVENTORY]->(m) "
        "SET r.quantity=$quantity, r.expiry_date=$expiry, r.last_updated=$updated",
        [{"fid": row["facility_id"], "mid": row["medication_id"],
          "quantity": row["quantity"], "expiry": _d(row["expiry_date"]),
          "updated": _d(row["last_updated"])} for row in inventory["retail_inventory"]])

    counts["SIMILAR_TO"] = run_many(
        "MATCH (a:Patient {id:$src}), (b:Patient {id:$tgt}) "
        "MERGE (a)-[r:SIMILAR_TO]->(b) SET r.score=$score, r.computed_by='python-similarity-v1'",
        [{"src": pair["source"], "tgt": pair["target"], "score": pair["score"]}
         for pair in clinical.get("similar_pairs", [])])

    counts["SUPPORTS"] = run_many(
        "MATCH (e:Evidence {id:$eid}), (t:Treatment {id:$tid}) "
        "MERGE (e)-[:SUPPORTS]->(t)",
        [{"eid": s["evidence_id"], "tid": s["treatment_id"]} for s in evidence["supports"]])
    counts["RELATES_TO"] = run_many(
        "MATCH (e:Evidence {id:$eid}), (d:Disease {id:$did}) "
        "MERGE (e)-[:RELATES_TO]->(d)",
        [{"eid": r["evidence_id"], "did": r["disease_id"]} for r in evidence["relates"]])
    counts["CITES_STUDY"] = run_many(
        "MATCH (e:Evidence {id:$eid}), (cs:ClinicalStudy {id:$sid}) "
        "MERGE (e)-[:CITES_STUDY]->(cs)",
        [{"eid": c["evidence_id"], "sid": c["study_id"]} for c in evidence["cites"]])

    return {"seeded": True, "counts": counts}


if __name__ == "__main__":
    from services.graph_service import close_driver

    summary = seed_all()
    print(json.dumps(summary, indent=2))
    close_driver()
