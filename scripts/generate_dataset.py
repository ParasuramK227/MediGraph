#!/usr/bin/env python3
"""Generate the MediGraph AI synthetic dataset.

Deterministic (seeded RNG), clearly fictional, no real PII.
Writes JSON files to data/synthetic/. Dates are generated relative to
`today` so expiry/shortage logic always demos correctly.
"""
from __future__ import annotations

import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from config import SYNTHETIC_DIR  # noqa: E402

RNG = random.Random(42)
TODAY = date.today()

# ------------------------------------------------------------- ontology ----

CITIES = {
    "Chennai": (13.0827, 80.2707),
    "Mumbai": (19.0760, 72.8777),
    "Delhi": (28.7041, 77.1025),
    "Bengaluru": (12.9716, 77.5946),
    "Hyderabad": (17.3850, 78.4867),
    "Pune": (18.5204, 73.8567),
    "Kolkata": (22.5726, 88.3639),
    "Ahmedabad": (23.0225, 72.5714),
    "Jaipur": (26.9124, 75.7873),
    "Kochi": (9.9312, 76.2673),
}

MEDICATIONS = {
    "Metformin": {"generic_name": "Metformin HCl", "form": "tablet", "strength": "500mg", "category": "antidiabetic"},
    "Gliclazide": {"generic_name": "Gliclazide", "form": "tablet", "strength": "80mg", "category": "antidiabetic"},
    "Insulin Glargine": {"generic_name": "Insulin Glargine", "form": "injection", "strength": "100IU/mL", "category": "antidiabetic"},
    "Insulin Regular": {"generic_name": "Regular Human Insulin", "form": "injection", "strength": "100IU/mL", "category": "antidiabetic"},
    "Amlodipine": {"generic_name": "Amlodipine Besylate", "form": "tablet", "strength": "5mg", "category": "antihypertensive"},
    "Lisinopril": {"generic_name": "Lisinopril", "form": "tablet", "strength": "10mg", "category": "antihypertensive"},
    "Losartan": {"generic_name": "Losartan Potassium", "form": "tablet", "strength": "50mg", "category": "antihypertensive"},
    "Hydrochlorothiazide": {"generic_name": "Hydrochlorothiazide", "form": "tablet", "strength": "25mg", "category": "diuretic"},
    "Atorvastatin": {"generic_name": "Atorvastatin Calcium", "form": "tablet", "strength": "20mg", "category": "statin"},
    "Aspirin": {"generic_name": "Acetylsalicylic Acid", "form": "tablet", "strength": "75mg", "category": "antiplatelet"},
    "Clopidogrel": {"generic_name": "Clopidogrel Bisulfate", "form": "tablet", "strength": "75mg", "category": "antiplatelet"},
    "Salbutamol Inhaler": {"generic_name": "Salbutamol Sulfate", "form": "inhaler", "strength": "100mcg/dose", "category": "bronchodilator"},
    "Budesonide Inhaler": {"generic_name": "Budesonide", "form": "inhaler", "strength": "200mcg/dose", "category": "corticosteroid"},
    "Montelukast": {"generic_name": "Montelukast Sodium", "form": "tablet", "strength": "10mg", "category": "leukotriene antagonist"},
    "Prednisolone": {"generic_name": "Prednisolone", "form": "tablet", "strength": "5mg", "category": "corticosteroid"},
    "Paracetamol": {"generic_name": "Paracetamol", "form": "tablet", "strength": "500mg", "category": "analgesic"},
    "Ibuprofen": {"generic_name": "Ibuprofen", "form": "tablet", "strength": "400mg", "category": "nsaid"},
    "Diclofenac Gel": {"generic_name": "Diclofenac Diethylamine", "form": "gel", "strength": "1%", "category": "nsaid"},
    "Naproxen": {"generic_name": "Naproxen Sodium", "form": "tablet", "strength": "250mg", "category": "nsaid"},
    "Sumatriptan": {"generic_name": "Sumatriptan Succinate", "form": "tablet", "strength": "50mg", "category": "triptan"},
    "Propranolol": {"generic_name": "Propranolol HCl", "form": "tablet", "strength": "40mg", "category": "beta blocker"},
    "Omeprazole": {"generic_name": "Omeprazole", "form": "capsule", "strength": "20mg", "category": "ppi"},
    "Pantoprazole": {"generic_name": "Pantoprazole Sodium", "form": "tablet", "strength": "40mg", "category": "ppi"},
    "Ranitidine": {"generic_name": "Ranitidine HCl", "form": "tablet", "strength": "150mg", "category": "h2 blocker"},
    "Ferrous Sulfate": {"generic_name": "Ferrous Sulfate", "form": "tablet", "strength": "200mg", "category": "iron supplement"},
    "Vitamin D3": {"generic_name": "Cholecalciferol", "form": "sachet", "strength": "60000IU", "category": "vitamin"},
    "Levothyroxine": {"generic_name": "Levothyroxine Sodium", "form": "tablet", "strength": "50mcg", "category": "thyroid hormone"},
    "Methimazole": {"generic_name": "Methimazole", "form": "tablet", "strength": "5mg", "category": "antithyroid"},
    "Amoxicillin": {"generic_name": "Amoxicillin Trihydrate", "form": "capsule", "strength": "500mg", "category": "antibiotic"},
    "Azithromycin": {"generic_name": "Azithromycin Dihydrate", "form": "tablet", "strength": "500mg", "category": "antibiotic"},
    "Ciprofloxacin": {"generic_name": "Ciprofloxacin HCl", "form": "tablet", "strength": "500mg", "category": "antibiotic"},
    "Ceftriaxone": {"generic_name": "Ceftriaxone Sodium", "form": "injection", "strength": "1g", "category": "antibiotic"},
    "Oseltamivir": {"generic_name": "Oseltamivir Phosphate", "form": "capsule", "strength": "75mg", "category": "antiviral"},
    "Hydroxychloroquine": {"generic_name": "Hydroxychloroquine Sulfate", "form": "tablet", "strength": "200mg", "category": "antirheumatic"},
    "Artemether-Lumefantrine": {"generic_name": "Artemether and Lumefantrine", "form": "tablet", "strength": "80/480mg", "category": "antimalarial"},
    "Albendazole": {"generic_name": "Albendazole", "form": "tablet", "strength": "400mg", "category": "anthelmintic"},
    "ORS Sachet": {"generic_name": "Oral Rehydration Salts", "form": "sachet", "strength": "20.5g", "category": "rehydration"},
    "Ondansetron": {"generic_name": "Ondansetron HCl", "form": "tablet", "strength": "4mg", "category": "antiemetic"},
    "Cetirizine": {"generic_name": "Cetirizine Dihydrochloride", "form": "tablet", "strength": "10mg", "category": "antihistamine"},
    "Loratadine": {"generic_name": "Loratadine", "form": "tablet", "strength": "10mg", "category": "antihistamine"},
    "Furosemide": {"generic_name": "Furosemide", "form": "tablet", "strength": "40mg", "category": "diuretic"},
    "Spironolactone": {"generic_name": "Spironolactone", "form": "tablet", "strength": "25mg", "category": "diuretic"},
    "Warfarin": {"generic_name": "Warfarin Sodium", "form": "tablet", "strength": "5mg", "category": "anticoagulant"},
    "Heparin": {"generic_name": "Unfractionated Heparin", "form": "injection", "strength": "5000IU/mL", "category": "anticoagulant"},
}

TREATMENTS = {
    "Metformin Therapy": {"type": "pharmacological", "medications": ["Metformin"]},
    "Oral Hypoglycemic Therapy": {"type": "pharmacological", "medications": ["Gliclazide", "Metformin"]},
    "Insulin Regimen": {"type": "pharmacological", "medications": ["Insulin Glargine", "Insulin Regular"]},
    "ACE Inhibitor Therapy": {"type": "pharmacological", "medications": ["Lisinopril"]},
    "ARB Therapy": {"type": "pharmacological", "medications": ["Losartan"]},
    "Calcium Channel Blocker Therapy": {"type": "pharmacological", "medications": ["Amlodipine"]},
    "Thiazide Diuretic Therapy": {"type": "pharmacological", "medications": ["Hydrochlorothiazide"]},
    "Statin Therapy": {"type": "pharmacological", "medications": ["Atorvastatin"]},
    "Antiplatelet Therapy": {"type": "pharmacological", "medications": ["Aspirin", "Clopidogrel"]},
    "Asthma Stepwise Therapy": {"type": "pharmacological", "medications": ["Salbutamol Inhaler", "Budesonide Inhaler", "Montelukast"]},
    "Acute Asthma Relief": {"type": "pharmacological", "medications": ["Salbutamol Inhaler", "Prednisolone"]},
    "Analgesic Therapy": {"type": "pharmacological", "medications": ["Paracetamol", "Ibuprofen"]},
    "NSAID Therapy": {"type": "pharmacological", "medications": ["Diclofenac Gel", "Naproxen"]},
    "Migraine Abortive Therapy": {"type": "pharmacological", "medications": ["Sumatriptan"]},
    "Migraine Prophylaxis": {"type": "pharmacological", "medications": ["Propranolol"]},
    "PPI Therapy": {"type": "pharmacological", "medications": ["Omeprazole", "Pantoprazole"]},
    "H2 Blocker Therapy": {"type": "pharmacological", "medications": ["Ranitidine"]},
    "Iron Supplementation": {"type": "pharmacological", "medications": ["Ferrous Sulfate"]},
    "Vitamin D Replacement": {"type": "pharmacological", "medications": ["Vitamin D3"]},
    "Thyroid Hormone Replacement": {"type": "pharmacological", "medications": ["Levothyroxine"]},
    "Antithyroid Therapy": {"type": "pharmacological", "medications": ["Methimazole"]},
    "Empirical Antibiotic Therapy": {"type": "pharmacological", "medications": ["Amoxicillin", "Azithromycin"]},
    "Broad Spectrum Antibiotic Therapy": {"type": "pharmacological", "medications": ["Ciprofloxacin", "Ceftriaxone"]},
    "Antiviral Therapy": {"type": "pharmacological", "medications": ["Oseltamivir"]},
    "Antimalarial Therapy": {"type": "pharmacological", "medications": ["Artemether-Lumefantrine"]},
    "Anthelmintic Therapy": {"type": "pharmacological", "medications": ["Albendazole"]},
    "ORS Rehydration Therapy": {"type": "supportive", "medications": ["ORS Sachet", "Ondansetron"]},
    "Antihistamine Therapy": {"type": "pharmacological", "medications": ["Cetirizine", "Loratadine"]},
    "Heart Failure Management": {"type": "pharmacological", "medications": ["Furosemide", "Spironolactone", "Lisinopril"]},
    "Anticoagulation Therapy": {"type": "pharmacological", "medications": ["Warfarin", "Heparin"]},
    "DMARD Therapy": {"type": "pharmacological", "medications": ["Hydroxychloroquine", "Naproxen"]},
    "Lifestyle Modification Program": {"type": "procedural", "medications": []},
    "Pulmonary Rehabilitation": {"type": "procedural", "medications": []},
}

DISEASES = [
    ("Type 2 Diabetes Mellitus", "Endocrine", "E11",
     ["Increased thirst", "Frequent urination", "Fatigue", "Blurred vision", "Slow wound healing"],
     ["Metformin Therapy", "Oral Hypoglycemic Therapy", "Insulin Regimen", "Lifestyle Modification Program"]),
    ("Type 1 Diabetes Mellitus", "Endocrine", "E10",
     ["Increased thirst", "Frequent urination", "Weight loss", "Fatigue", "Blurred vision"],
     ["Insulin Regimen"]),
    ("Hypertension", "Cardiovascular", "I10",
     ["Headache", "Dizziness", "Blurred vision", "Chest discomfort"],
     ["ACE Inhibitor Therapy", "ARB Therapy", "Calcium Channel Blocker Therapy", "Thiazide Diuretic Therapy", "Lifestyle Modification Program"]),
    ("Bronchial Asthma", "Respiratory", "J45",
     ["Wheezing", "Shortness of breath", "Chest tightness", "Nighttime cough"],
     ["Asthma Stepwise Therapy", "Acute Asthma Relief"]),
    ("Chronic Obstructive Pulmonary Disease", "Respiratory", "J44",
     ["Chronic cough", "Sputum production", "Shortness of breath", "Wheezing"],
     ["Asthma Stepwise Therapy", "Acute Asthma Relief", "Pulmonary Rehabilitation"]),
    ("Migraine", "Neurological", "G43",
     ["Throbbing headache", "Nausea", "Photophobia", "Visual aura"],
     ["Migraine Abortive Therapy", "Migraine Prophylaxis", "Analgesic Therapy"]),
    ("Gastroesophageal Reflux Disease", "Gastrointestinal", "K21",
     ["Heartburn", "Acid regurgitation", "Chest burning", "Chronic cough"],
     ["PPI Therapy", "H2 Blocker Therapy", "Lifestyle Modification Program"]),
    ("Peptic Ulcer Disease", "Gastrointestinal", "K25",
     ["Epigastric pain", "Bloating", "Nausea", "Heartburn"],
     ["PPI Therapy", "H2 Blocker Therapy"]),
    ("Iron Deficiency Anemia", "Hematological", "D50",
     ["Fatigue", "Pallor", "Shortness of breath", "Dizziness", "Brittle nails"],
     ["Iron Supplementation"]),
    ("Hypothyroidism", "Endocrine", "E03",
     ["Fatigue", "Weight gain", "Cold intolerance", "Dry skin", "Constipation"],
     ["Thyroid Hormone Replacement"]),
    ("Hyperthyroidism", "Endocrine", "E05",
     ["Weight loss", "Heat intolerance", "Palpitations", "Tremor"],
     ["Antithyroid Therapy"]),
    ("Community-Acquired Pneumonia", "Infectious", "J18",
     ["Fever", "Productive cough", "Chest pain", "Shortness of breath"],
     ["Empirical Antibiotic Therapy", "Broad Spectrum Antibiotic Therapy"]),
    ("Acute Pharyngitis", "Infectious", "J02",
     ["Sore throat", "Fever", "Swollen lymph nodes"],
     ["Empirical Antibiotic Therapy", "Analgesic Therapy"]),
    ("Typhoid Fever", "Infectious", "A01",
     ["Fever", "Abdominal pain", "Headache", "Diarrhea"],
     ["Broad Spectrum Antibiotic Therapy"]),
    ("Influenza", "Infectious", "J11",
     ["Fever", "Body ache", "Dry cough", "Sore throat", "Fatigue"],
     ["Antiviral Therapy", "Analgesic Therapy"]),
    ("Dengue Fever", "Infectious", "A90",
     ["High fever", "Severe headache", "Joint pain", "Skin rash", "Fatigue"],
     ["Analgesic Therapy", "ORS Rehydration Therapy"]),
    ("Malaria", "Infectious", "B54",
     ["Intermittent fever", "Chills", "Sweating", "Headache", "Fatigue"],
     ["Antimalarial Therapy"]),
    ("Acute Gastroenteritis", "Gastrointestinal", "A09",
     ["Diarrhea", "Vomiting", "Abdominal cramps", "Fever", "Dehydration"],
     ["ORS Rehydration Therapy"]),
    ("Intestinal Worm Infestation", "Parasitic", "B82",
     ["Abdominal pain", "Diarrhea", "Weight loss", "Fatigue"],
     ["Anthelmintic Therapy"]),
    ("Allergic Rhinitis", "Immunological", "J30",
     ["Sneezing", "Runny nose", "Nasal congestion", "Itchy eyes"],
     ["Antihistamine Therapy"]),
    ("Rheumatoid Arthritis", "Autoimmune", "M06",
     ["Joint pain", "Joint swelling", "Morning stiffness", "Fatigue"],
     ["DMARD Therapy", "NSAID Therapy", "Analgesic Therapy"]),
    ("Osteoarthritis", "Musculoskeletal", "M15",
     ["Joint pain", "Stiffness", "Reduced mobility", "Joint swelling"],
     ["NSAID Therapy", "Analgesic Therapy"]),
    ("Coronary Artery Disease", "Cardiovascular", "I25",
     ["Chest pain", "Shortness of breath", "Fatigue", "Palpitations"],
     ["Antiplatelet Therapy", "Statin Therapy", "ACE Inhibitor Therapy"]),
    ("Heart Failure", "Cardiovascular", "I50",
     ["Shortness of breath", "Leg swelling", "Fatigue", "Rapid weight gain"],
     ["Heart Failure Management"]),
    ("Atrial Fibrillation", "Cardiovascular", "I48",
     ["Palpitations", "Dizziness", "Fatigue", "Shortness of breath"],
     ["Anticoagulation Therapy"]),
    ("Deep Vein Thrombosis", "Cardiovascular", "I80",
     ["Leg swelling", "Leg pain", "Skin redness", "Warmth over vein"],
     ["Anticoagulation Therapy"]),
    ("Vitamin D Deficiency", "Nutritional", "E55",
     ["Fatigue", "Bone pain", "Muscle weakness"],
     ["Vitamin D Replacement"]),
]

ALTERNATIVE_PAIRS = [
    ("Paracetamol", "Ibuprofen"), ("Ibuprofen", "Naproxen"),
    ("Omeprazole", "Pantoprazole"), ("Omeprazole", "Ranitidine"),
    ("Cetirizine", "Loratadine"), ("Losartan", "Lisinopril"),
    ("Amoxicillin", "Azithromycin"), ("Metformin", "Gliclazide"),
    ("Amlodipine", "Losartan"), ("Sumatriptan", "Naproxen"),
]

LAB_TESTS = [
    ("Fasting Blood Sugar", "mg/dL", 70, 99), ("HbA1c", "%", 4.0, 5.6),
    ("Serum Creatinine", "mg/dL", 0.6, 1.3), ("Hemoglobin", "g/dL", 12.0, 16.0),
    ("Serum Ferritin", "ng/mL", 30, 300), ("TSH", "mIU/L", 0.4, 4.0),
    ("Free T4", "ng/dL", 0.8, 1.8), ("Total Cholesterol", "mg/dL", 120, 200),
    ("LDL Cholesterol", "mg/dL", 50, 100), ("HDL Cholesterol", "mg/dL", 40, 90),
    ("Triglycerides", "mg/dL", 50, 150), ("WBC Count", "cells/uL", 4000, 11000),
    ("Platelet Count", "cells/uL", 150000, 450000), ("CRP", "mg/L", 0, 5),
    ("ESR", "mm/hr", 0, 20), ("Vitamin D (25-OH)", "ng/mL", 30, 100),
    ("Uric Acid", "mg/dL", 3.5, 7.2), ("Systolic Blood Pressure", "mmHg", 90, 120),
]

LABS_BY_DISEASE = {
    "Type 2 Diabetes Mellitus": ["Fasting Blood Sugar", "HbA1c", "Serum Creatinine", "Total Cholesterol"],
    "Type 1 Diabetes Mellitus": ["Fasting Blood Sugar", "HbA1c"],
    "Hypertension": ["Systolic Blood Pressure", "Serum Creatinine", "Total Cholesterol", "LDL Cholesterol"],
    "Bronchial Asthma": ["WBC Count", "CRP", "ESR"],
    "Chronic Obstructive Pulmonary Disease": ["WBC Count", "CRP", "ESR"],
    "Migraine": ["CRP", "ESR"],
    "Gastroesophageal Reflux Disease": ["Hemoglobin"],
    "Peptic Ulcer Disease": ["Hemoglobin"],
    "Iron Deficiency Anemia": ["Hemoglobin", "Serum Ferritin", "ESR"],
    "Hypothyroidism": ["TSH", "Free T4"],
    "Hyperthyroidism": ["TSH", "Free T4"],
    "Community-Acquired Pneumonia": ["WBC Count", "CRP", "Platelet Count"],
    "Acute Pharyngitis": ["WBC Count", "CRP"],
    "Typhoid Fever": ["WBC Count", "Platelet Count", "CRP"],
    "Influenza": ["WBC Count", "CRP"],
    "Dengue Fever": ["Platelet Count", "WBC Count", "Hemoglobin"],
    "Malaria": ["Hemoglobin", "Platelet Count"],
    "Acute Gastroenteritis": ["Serum Creatinine", "WBC Count"],
    "Intestinal Worm Infestation": ["Hemoglobin", "ESR"],
    "Allergic Rhinitis": ["WBC Count", "ESR"],
    "Rheumatoid Arthritis": ["CRP", "ESR", "Uric Acid"],
    "Osteoarthritis": ["Uric Acid", "ESR"],
    "Coronary Artery Disease": ["Total Cholesterol", "LDL Cholesterol", "HDL Cholesterol", "Triglycerides"],
    "Heart Failure": ["Serum Creatinine", "Systolic Blood Pressure"],
    "Atrial Fibrillation": ["TSH", "Serum Creatinine"],
    "Deep Vein Thrombosis": ["Platelet Count", "CRP"],
    "Vitamin D Deficiency": ["Vitamin D (25-OH)", "Serum Creatinine"],
}

MALE_FIRST = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Rohan", "Karthik",
              "Suresh", "Rahul", "Vikram", "Anand", "Prakash", "Nikhil", "Siddharth", "Harish",
              "Manoj", "Deepak", "Ajay", "Sanjay", "Gopal", "Ramesh", "Krishna", "Dev"]
FEMALE_FIRST = ["Ananya", "Diya", "Aadhya", "Myra", "Sara", "Priya", "Meera", "Kavya",
                "Lakshmi", "Divya", "Nisha", "Pooja", "Shreya", "Anjali", "Radhika", "Swathi",
                "Geetha", "Nandini", "Sruthi", "Bhavna", "Ishita", "Riya", "Tara", "Veda"]
SURNAMES = ["Sharma", "Patel", "Iyer", "Reddy", "Nair", "Gupta", "Menon", "Rao", "Desai",
            "Kulkarni", "Joshi", "Verma", "Pillai", "Chatterjee", "Banerjee", "Mehta",
            "Agarwal", "Pillay", "Krishnan", "Subramanian", "Bhat", "Naik", "Shetty", "Kaur"]

DOCTOR_SPECIALTIES = ["General Medicine", "Cardiology", "Endocrinology", "Pulmonology",
                      "Neurology", "Gastroenterology", "Infectious Disease", "Rheumatology"]

MANUFACTURERS = ["Sunrise Pharma Labs", "Deccan Pharmaceuticals", "NovaMed Laboratories",
                 "Indus Biotech", "Coastal Generics", "Apex Therapeutics"]
SUPPLIERS = ["MedLink Supplies", "HealthBridge Distribution", "PrimeChem Traders",
             "VitalSource Logistics", "TrustPharm Imports", "SafeRoute Medical"]
DISTRIBUTORS = ["National Med Distributors", "QuickRelay Pharma", "CentralDrug Logistics",
                "ExpressHealth Supply", "MetroPharm Freight"]
JOURNALS = ["Journal of Clinical Medicine", "The Lancet Regional Health", "NEJM Evidence",
            "BMJ Open", "Annals of Internal Medicine", "Journal of the AMA",
            "Cochrane Database of Systematic Reviews", "PLOS Medicine"]
STUDY_TITLES = [
    "Efficacy of first-line metformin in newly diagnosed type 2 diabetes: a multicenter RCT",
    "Comparative effectiveness of ACE inhibitors versus ARBs in uncontrolled hypertension",
    "Stepwise asthma therapy and exacerbation rates: a 24-month cohort analysis",
    "Triptan therapy for acute migraine: systematic review with meta-analysis",
    "PPI versus H2 blockers for erosive esophagitis healing at 8 weeks",
    "Oral iron supplementation in iron-deficiency anemia: dose-finding study",
    "Levothyroxine dose titration strategies in subclinical hypothyroidism",
    "Short-course antibiotics for community-acquired pneumonia: non-inferiority trial",
    "Oseltamivir within 48 hours of influenza onset: observational study",
    "ORS plus ondansetron for pediatric gastroenteritis: pragmatic trial",
    "Single-dose albendazole for soil-transmitted helminths: meta-analysis",
    "Second-generation antihistamines in allergic rhinitis: network meta-analysis",
    "DMARD initiation delay and radiographic progression in rheumatoid arthritis",
    "Cardiovascular outcomes with moderate-intensity statins: real-world evidence",
    "DOAC versus warfarin in atrial fibrillation: pooled analysis",
]


def iso(d: date) -> str:
    return d.isoformat()


def jitter(city: tuple) -> tuple:
    return (round(city[0] + RNG.uniform(-0.15, 0.15), 4),
            round(city[1] + RNG.uniform(-0.15, 0.15), 4))


def generate_ontology() -> dict:
    symptoms = sorted({s for _, _, _, syms, _ in DISEASES for s in syms})
    diseases = []
    for i, (name, category, icd, symptoms_list, treatments) in enumerate(DISEASES):
        diseases.append({
            "id": f"disease-{i + 1:03d}", "name": name, "category": category,
            "icd_code": icd, "symptoms": symptoms_list, "treatments": treatments,
        })
    treatments = []
    for i, (name, spec) in enumerate(TREATMENTS.items()):
        treatments.append({"id": f"treatment-{i + 1:03d}", "name": name,
                           "type": spec["type"], "medications": spec["medications"]})
    medications = []
    for i, (name, props) in enumerate(MEDICATIONS.items()):
        medications.append({"id": f"drug-{i + 1:03d}", "name": name, **props})
    labs = []
    for i, (name, unit, low, high) in enumerate(LAB_TESTS):
        labs.append({"id": f"lab-{i + 1:03d}", "name": name, "unit": unit,
                     "ref_low": low, "ref_high": high})
    return {
        "symptoms": [{"id": f"symptom-{i + 1:03d}", "name": s} for i, s in enumerate(symptoms)],
        "diseases": diseases, "treatments": treatments, "medications": medications, "labs": labs,
        "alternatives": [{"source": a, "target": b} for a, b in ALTERNATIVE_PAIRS],
    }


def generate_clinical(ontology: dict) -> dict:
    doctors = [{"id": f"doctor-{i + 1:03d}", "name": f"Dr. {RNG.choice(MALE_FIRST + FEMALE_FIRST)} {RNG.choice(SURNAMES)}",
                "specialty": spec}
               for i, spec in enumerate(DOCTOR_SPECIALTIES * 4)]

    disease_by_name = {d["name"]: d for d in ontology["diseases"]}
    treatment_by_name = {t["name"]: t for t in ontology["treatments"]}
    lab_by_name = {l["name"]: l for l in ontology["labs"]}
    common_diseases = [d for d in ontology["diseases"]] * 3  # weight common ones

    patients = []
    used_names = set()
    for i in range(200):
        while True:
            gender = RNG.choice(["male", "female"])
            first = RNG.choice(MALE_FIRST if gender == "male" else FEMALE_FIRST)
            name = f"{first} {RNG.choice(SURNAMES)}"
            if name not in used_names:
                used_names.add(name)
                break
        pid = f"patient-{i + 1:03d}"
        n_diseases = 1 if RNG.random() < 0.65 else 2
        chosen = RNG.sample(common_diseases, n_diseases)

        diagnoses, lab_results, received, records = [], [], [], []
        patient_symptoms = set()
        for disease in chosen:
            diagnoses.append({
                "disease_id": disease["id"], "disease": disease["name"],
                "diagnosed_at": iso(TODAY - timedelta(days=RNG.randint(30, 900))),
                "status": RNG.choice(["active", "active", "active", "managed"]),
                "severity": RNG.choice(["mild", "moderate", "moderate", "severe"]),
            })
            patient_symptoms.update(RNG.sample(
                disease_by_name[disease["name"]]["symptoms"],
                k=max(2, len(disease["symptoms"]) - RNG.randint(0, 2))))
            for lab_name in LABS_BY_DISEASE.get(disease["name"], []):
                lab = lab_by_name[lab_name]
                roll = RNG.random()
                if roll < 0.55:
                    value = RNG.uniform(lab["ref_low"], lab["ref_high"]); flag = "normal"
                elif roll < 0.8:
                    value = lab["ref_high"] * RNG.uniform(1.05, 1.9); flag = "high"
                else:
                    value = lab["ref_low"] * RNG.uniform(0.35, 0.95); flag = "low"
                value = round(value, 2)
                lab_results.append({
                    "lab_id": lab["id"], "test": lab_name, "value": value,
                    "unit": lab["unit"], "flag": flag,
                    "tested_at": iso(TODAY - timedelta(days=RNG.randint(5, 400))),
                })
            options = [t for t in disease["treatments"]]
            for tname in RNG.sample(options, k=min(len(options), RNG.randint(1, 3))):
                treatment = treatment_by_name[tname]
                outcome_roll = RNG.random()
                outcome = ("success" if outcome_roll < 0.62
                           else "partial" if outcome_roll < 0.84 else "failure")
                received.append({
                    "treatment_id": treatment["id"], "treatment": tname,
                    "outcome": outcome,
                    "started_at": iso(TODAY - timedelta(days=RNG.randint(20, 700))),
                    "duration_days": RNG.randint(7, 180),
                    "doctor_id": RNG.choice(doctors)["id"],
                })

        record_texts = [
            f"{name}, {RNG.randint(21, 84)}-year-old {'man' if gender == 'male' else 'woman'}, presented with "
            f"{', '.join(sorted(patient_symptoms)[:3])}. Working diagnosis: "
            f"{', '.join(d['disease'] for d in diagnoses)}. Initial plan documented.",
            f"Clinical review completed. Current management includes "
            f"{', '.join(r['treatment'] for r in received) or 'observation'}. "
            f"Tolerance to therapy reported as good; no adverse events noted.",
            f"Follow-up assessment: symptom burden improved since last visit. "
            f"Investigations reviewed; continue current plan and reinforce adherence.",
        ]
        for j, text in enumerate(record_texts[: RNG.randint(2, 3)]):
            records.append({
                "id": f"record-{i + 1:03d}-{j + 1}", "patient_id": pid,
                "record_type": ["admission_note", "progress_note", "follow_up"][j % 3],
                "summary": text,
                "recorded_at": iso(TODAY - timedelta(days=RNG.randint(3, 600))),
            })

        patients.append({
            "id": pid, "name": name, "age": RNG.randint(18, 85), "gender": gender,
            "blood_type": RNG.choice(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]),
            "city": RNG.choice(list(CITIES.keys())),
            "diagnoses": diagnoses, "lab_results": lab_results,
            "treatments_received": received, "records": records,
        })
    return {"doctors": doctors, "patients": patients}


def generate_facilities() -> dict:
    hospitals, pharmacies, warehouses = [], [], []
    city_names = list(CITIES.items())
    hospital_prefixes = ["City Care", "Sunrise Multispecialty", "Lakeview", "St. Mary's",
                         "Apex Health", "Green Park", "Riverside", "Fortis Prime",
                         "Lotus Institute", "Harmony"]
    for i in range(10):
        city, coords = city_names[i % len(city_names)]
        lat, lng = jitter(coords)
        hospitals.append({"id": f"hospital-{i + 1:03d}",
                          "name": f"{hospital_prefixes[i]} Hospital",
                          "city": city, "latitude": lat, "longitude": lng,
                          "level": RNG.choice(["primary", "secondary", "tertiary"])})
    pharmacy_names = ["Wellness", "MedPlus Daily", "CarePoint", "HealthHub", "LifeLine",
                      "Neighborhood", "Family", "CityMed", "Guardian", "Remedy",
                      "Apollo Community", "Sanjeevani", "Arogya", "Sehat", "Dawa Corner"]
    for i in range(15):
        city, coords = city_names[(i * 3 + 1) % len(city_names)]
        lat, lng = jitter(coords)
        pharmacies.append({"id": f"pharmacy-{i + 1:03d}",
                           "name": f"{pharmacy_names[i]} Pharmacy",
                           "city": city, "latitude": lat, "longitude": lng})
    warehouse_names = ["North Zone Central", "South Zone Central", "East Zone Hub",
                       "West Zone Hub", "Metro Depot", "Regional Bulk Store",
                       "Coastal Depot", "Highland Depot"]
    for i in range(8):
        city, coords = city_names[(i * 2 + 2) % len(city_names)]
        lat, lng = jitter(coords)
        warehouses.append({"id": f"warehouse-{i + 1:03d}",
                           "name": f"{warehouse_names[i]} Warehouse",
                           "city": city, "latitude": lat, "longitude": lng,
                           "capacity_units": RNG.randint(5000, 20000)})
    return {"hospitals": hospitals, "pharmacies": pharmacies, "warehouses": warehouses}


def generate_supply_chain(ontology: dict, facilities: dict) -> dict:
    manufacturers = [{"id": f"manufacturer-{i + 1:03d}", "name": name,
                      "country": RNG.choice(["India", "India", "India", "Singapore"])}
                     for i, name in enumerate(MANUFACTURERS)]
    suppliers = [{"id": f"supplier-{i + 1:03d}", "name": name,
                  "country": RNG.choice(["India", "China", "Germany"])}
                 for i, name in enumerate(SUPPLIERS)]
    distributors = [{"id": f"distributor-{i + 1:03d}", "name": name,
                     "region": RNG.choice(["North", "South", "East", "West", "Pan-India"])}
                    for i, name in enumerate(DISTRIBUTORS)]

    batches, stored_at, shipped_to = [], [], []
    batch_no = 1000
    for med in ontology["medications"]:
        manufacturer = RNG.choice(manufacturers)
        supplier = RNG.choice(suppliers)
        distributor = RNG.choice(distributors)
        for _ in range(RNG.randint(2, 4)):
            batch_no += 1
            bid = f"BATCH-{batch_no}"
            roll = RNG.random()
            if roll < 0.08:  # already expired
                expiry = TODAY - timedelta(days=RNG.randint(5, 120))
            elif roll < 0.2:  # expiring soon
                expiry = TODAY + timedelta(days=RNG.randint(10, 85))
            else:
                expiry = TODAY + timedelta(days=RNG.randint(90, 540))
            manufacture_date = expiry - timedelta(days=RNG.randint(360, 720))
            batches.append({
                "id": bid, "medication_id": med["id"],
                "manufacture_date": iso(manufacture_date), "expiry_date": iso(expiry),
                "quantity_initial": RNG.randint(200, 1000),
                "manufacturer_id": manufacturer["id"], "supplier_id": supplier["id"],
                "distributor_id": distributor["id"],
            })
            for wh in RNG.sample(facilities["warehouses"], RNG.randint(1, 3)):
                qty = RNG.choice([0, 0] + [RNG.randint(10, 300) for _ in range(6)])
                if qty > 0:
                    stored_at.append({"batch_id": bid, "warehouse_id": wh["id"],
                                      "quantity": qty,
                                      "arrived_at": iso(TODAY - timedelta(days=RNG.randint(10, 300)))})

    supplies = []
    all_facilities = facilities["hospitals"] + facilities["pharmacies"]
    for wh in facilities["warehouses"]:
        targets = RNG.sample(all_facilities, RNG.randint(3, 6))
        for target in targets:
            supplies.append({"warehouse_id": wh["id"], "facility_id": target["id"],
                             "lead_time_days": RNG.randint(1, 6)})

    return {"manufacturers": manufacturers, "suppliers": suppliers,
            "distributors": distributors, "batches": batches,
            "stored_at": stored_at, "shipped_to": shipped_to, "supplies": supplies}


def generate_inventory(ontology: dict, facilities: dict) -> dict:
    rows = []
    meds = ontology["medications"]
    for facility in facilities["hospitals"] + facilities["pharmacies"]:
        stocked = RNG.sample(meds, RNG.randint(14, 22))
        for med in stocked:
            roll = RNG.random()
            if roll < 0.10:
                quantity = 0
            elif roll < 0.28:
                quantity = RNG.randint(1, 19)
            elif roll < 0.93:
                quantity = RNG.randint(20, 80)
            else:
                quantity = RNG.randint(81, 160)
            expiry_roll = RNG.random()
            if expiry_roll < 0.07:  # expired shelf stock (must be ignored)
                expiry = TODAY - timedelta(days=RNG.randint(2, 60))
            else:
                expiry = TODAY + timedelta(days=RNG.randint(15, 420))
            rows.append({
                "facility_id": facility["id"], "medication_id": med["id"],
                "quantity": quantity, "expiry_date": iso(expiry),
                "last_updated": iso(TODAY - timedelta(days=RNG.randint(0, 14))),
            })
    return {"retail_inventory": rows}


def generate_evidence(ontology: dict) -> dict:
    studies = []
    for i, title in enumerate(STUDY_TITLES):
        studies.append({
            "id": f"study-{i + 1:03d}", "title": title,
            "journal": RNG.choice(JOURNALS),
            "publication_date": iso(date(RNG.randint(2019, 2026), RNG.randint(1, 12), RNG.randint(1, 28))),
            "sample_size": RNG.randint(240, 12000),
            "phase": RNG.choice(["III", "IV", "observational"]),
            "summary": f"Study evaluating: {title.lower()}. Reported statistically significant "
                       f"improvements in primary endpoints with an acceptable safety profile.",
        })

    evidence, supports, relates = [], [], []
    top_treatments = [t for t in ontology["treatments"]][:33]
    for i, treatment in enumerate(top_treatments):
        for k in range(RNG.randint(1, 2)):
            idx = len(evidence) + 1
            eid = f"evidence-{idx:03d}"
            etype = RNG.choice(["meta-analysis", "randomized-controlled-trial",
                                "cohort-study", "clinical-guideline"])
            confidence = round(RNG.uniform(0.55, 0.95), 2)
            summary = (f"{etype.replace('-', ' ').title()} supporting {treatment['name']} "
                       f"with reported benefit across primary outcomes; confidence {confidence}.")
            evidence.append({
                "id": eid, "source": RNG.choice(JOURNALS),
                "evidence_type": etype, "confidence": confidence,
                "publication_date": iso(date(RNG.randint(2019, 2026), RNG.randint(1, 12), RNG.randint(1, 28))),
                "supports_treatment_id": treatment["id"], "summary": summary,
            })
            supports.append({"evidence_id": eid, "treatment_id": treatment["id"]})
            related = RNG.sample(ontology["diseases"], 1)[0]
            relates.append({"evidence_id": eid, "disease_id": related["id"]})
    cites = [{"evidence_id": e["id"], "study_id": RNG.choice(studies)["id"]} for e in evidence]
    return {"studies": studies, "evidence": evidence, "supports": supports,
            "relates": relates, "cites": cites}


def compute_similar_pairs(clinical: dict, ontology: dict) -> list[dict]:
    """Materialize top-3 SIMILAR_TO snapshots using the same deterministic math."""
    from services.similarity_service import compute_similarity_score

    profiles = {}
    for p in clinical["patients"]:
        profiles[p["id"]] = {
            "symptoms": {r for d in p["diagnoses"]
                         for r in next(x for x in ontology["diseases"] if x["id"] == d["disease_id"])["symptoms"]},
            "diseases": {d["disease"] for d in p["diagnoses"]},
            "labs": {f"{l['test']}|{l['flag']}" for l in p["lab_results"]},
            "treatments": {t["treatment"] for t in p["treatments_received"]},
        }
    ids = sorted(profiles)
    pairs = []
    for i, ida in enumerate(ids):
        scored = []
        for idb in ids[i + 1:]:
            result = compute_similarity_score(profiles[ida], profiles[idb])
            if result["score"] >= 0.25:
                scored.append((result["score"], idb))
        scored.sort(reverse=True)
        for score, idb in scored[:3]:
            pairs.append({"source": ida, "target": idb, "score": score})
    return pairs


def apply_scarcity(ontology: dict, supply: dict, inventory: dict) -> dict:
    """Deterministically create demo-worthy shortages.

    3 medicines end up with zero valid stock network-wide; 5 are low-stock.
    """
    meds = ontology["medications"]
    chosen = RNG.sample(meds, 8)
    out_meds = {m["id"] for m in chosen[:3]}
    low_meds = {m["id"] for m in chosen[3:]}
    out_batches = {b["id"] for b in supply["batches"] if b["medication_id"] in out_meds}

    for row in inventory["retail_inventory"]:
        if row["medication_id"] in out_meds:
            row["quantity"] = 0
        elif row["medication_id"] in low_meds:
            row["quantity"] = min(row["quantity"], RNG.randint(0, 8))

    supply["stored_at"] = [
        s for s in supply["stored_at"] if s["batch_id"] not in out_batches
    ]
    low_batches = {
        b["id"] for b in supply["batches"] if b["medication_id"] in low_meds
    }
    for s in supply["stored_at"]:
        if s["batch_id"] in low_batches:
            s["quantity"] = min(s["quantity"], RNG.randint(5, 25))
    return {
        "out_of_stock": sorted(m["name"] for m in chosen[:3]),
        "low_stock": sorted(m["name"] for m in chosen[3:]),
    }


def main() -> None:
    SYNTHETIC_DIR.mkdir(parents=True, exist_ok=True)
    print("Generating ontology...")
    ontology = generate_ontology()
    print("Generating clinical data (200 patients)...")
    clinical = generate_clinical(ontology)
    print("Computing SIMILAR_TO snapshots...")
    clinical["similar_pairs"] = compute_similar_pairs(clinical, ontology)
    print("Generating facilities...")
    facilities = generate_facilities()
    print("Generating supply chain...")
    supply_chain = generate_supply_chain(ontology, facilities)
    print("Generating inventory...")
    inventory = generate_inventory(ontology, facilities)
    print("Generating evidence...")
    evidence = generate_evidence(ontology)
    print("Applying deterministic scarcity for demo shortages...")
    scarcity = apply_scarcity(ontology, supply_chain, inventory)

    datasets = {
        "ontology.json": ontology,
        "clinical.json": clinical,
        "facilities.json": facilities,
        "supply_chain.json": supply_chain,
        "inventory.json": inventory,
        "evidence.json": evidence,
    }
    for filename, payload in datasets.items():
        path = SYNTHETIC_DIR / filename
        path.write_text(json.dumps(payload, indent=1))
        print(f"Wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")
    print(f"Out of stock medicines: {scarcity['out_of_stock']}")
    print(f"Low stock medicines:    {scarcity['low_stock']}")
    print("Done.")


if __name__ == "__main__":
    main()
