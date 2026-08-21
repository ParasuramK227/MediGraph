"""Graph schema: constraints and indexes. Idempotent."""
from services.graph_service import run_write

CONSTRAINTS = [
    ("patient_id", "CREATE CONSTRAINT patient_id IF NOT EXISTS FOR (n:Patient) REQUIRE n.id IS UNIQUE"),
    ("disease_id", "CREATE CONSTRAINT disease_id IF NOT EXISTS FOR (n:Disease) REQUIRE n.id IS UNIQUE"),
    ("symptom_id", "CREATE CONSTRAINT symptom_id IF NOT EXISTS FOR (n:Symptom) REQUIRE n.id IS UNIQUE"),
    ("treatment_id", "CREATE CONSTRAINT treatment_id IF NOT EXISTS FOR (n:Treatment) REQUIRE n.id IS UNIQUE"),
    ("medication_id", "CREATE CONSTRAINT medication_id IF NOT EXISTS FOR (n:Medication) REQUIRE n.id IS UNIQUE"),
    ("batch_id", "CREATE CONSTRAINT batch_id IF NOT EXISTS FOR (n:DrugBatch) REQUIRE n.id IS UNIQUE"),
    ("hospital_id", "CREATE CONSTRAINT hospital_id IF NOT EXISTS FOR (n:Hospital) REQUIRE n.id IS UNIQUE"),
    ("pharmacy_id", "CREATE CONSTRAINT pharmacy_id IF NOT EXISTS FOR (n:Pharmacy) REQUIRE n.id IS UNIQUE"),
    ("warehouse_id", "CREATE CONSTRAINT warehouse_id IF NOT EXISTS FOR (n:Warehouse) REQUIRE n.id IS UNIQUE"),
    ("manufacturer_id", "CREATE CONSTRAINT manufacturer_id IF NOT EXISTS FOR (n:Manufacturer) REQUIRE n.id IS UNIQUE"),
    ("supplier_id", "CREATE CONSTRAINT supplier_id IF NOT EXISTS FOR (n:Supplier) REQUIRE n.id IS UNIQUE"),
    ("distributor_id", "CREATE CONSTRAINT distributor_id IF NOT EXISTS FOR (n:Distributor) REQUIRE n.id IS UNIQUE"),
    ("doctor_id", "CREATE CONSTRAINT doctor_id IF NOT EXISTS FOR (n:Doctor) REQUIRE n.id IS UNIQUE"),
    ("study_id", "CREATE CONSTRAINT study_id IF NOT EXISTS FOR (n:ClinicalStudy) REQUIRE n.id IS UNIQUE"),
    ("evidence_id", "CREATE CONSTRAINT evidence_id IF NOT EXISTS FOR (n:Evidence) REQUIRE n.id IS UNIQUE"),
    ("record_id", "CREATE CONSTRAINT record_id IF NOT EXISTS FOR (n:MedicalRecord) REQUIRE n.id IS UNIQUE"),
]

INDEXES = [
    ("patient_name", "CREATE INDEX patient_name IF NOT EXISTS FOR (n:Patient) ON (n.name)"),
    ("disease_name", "CREATE INDEX disease_name IF NOT EXISTS FOR (n:Disease) ON (n.name)"),
    ("symptom_name", "CREATE INDEX symptom_name IF NOT EXISTS FOR (n:Symptom) ON (n.name)"),
    ("treatment_name", "CREATE INDEX treatment_name IF NOT EXISTS FOR (n:Treatment) ON (n.name)"),
    ("medication_name", "CREATE INDEX medication_name IF NOT EXISTS FOR (n:Medication) ON (n.name)"),
    ("hospital_name", "CREATE INDEX hospital_name IF NOT EXISTS FOR (n:Hospital) ON (n.name)"),
    ("pharmacy_name", "CREATE INDEX pharmacy_name IF NOT EXISTS FOR (n:Pharmacy) ON (n.name)"),
    ("warehouse_name", "CREATE INDEX warehouse_name IF NOT EXISTS FOR (n:Warehouse) ON (n.name)"),
]


def ensure_schema() -> None:
    for _, statement in CONSTRAINTS + INDEXES:
        run_write(statement)


def clear_graph() -> None:
    run_write("MATCH (n) DETACH DELETE n")
