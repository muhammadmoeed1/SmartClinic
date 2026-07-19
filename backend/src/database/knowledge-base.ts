/**
 * Illustrative clinic-operations knowledge base for the RAG demo (specialty
 * routing, intake red-flag cues, SOAP documentation tips). This is fictional
 * demo content written for this project, not real clinical guidance — see
 * the README's Academic Integrity note.
 */
export interface KnowledgeSeed {
  category: 'specialty-routing' | 'triage' | 'documentation';
  specialty: string | null;
  title: string;
  content: string;
}

export const KNOWLEDGE_BASE: KnowledgeSeed[] = [
  // ---- specialty-routing ----
  {
    category: 'specialty-routing',
    specialty: 'General Practice',
    title: 'When to route to General Practice',
    content:
      'General Practice is the default for anything unclear, general, preventive, or spanning multiple body systems: routine check-ups, vaccinations, minor infections, fatigue, weight changes, and follow-ups that do not clearly belong to a specialty. If a patient describes several unrelated symptoms at once, General Practice is usually the right first stop.',
  },
  {
    category: 'specialty-routing',
    specialty: 'Cardiology',
    title: 'When to route to Cardiology',
    content:
      'Route to Cardiology for chest pain or tightness, palpitations, irregular heartbeat, shortness of breath on exertion, high blood pressure follow-up, swelling in the legs or ankles suggestive of heart strain, or a family history of heart disease combined with cardiac symptoms.',
  },
  {
    category: 'specialty-routing',
    specialty: 'Dermatology',
    title: 'When to route to Dermatology',
    content:
      'Route to Dermatology for skin rashes, persistent itching, changing or irregular moles, hair loss, nail discoloration or deformity, acne, eczema, psoriasis, or any new skin lesion that has changed in size, shape, or color.',
  },
  {
    category: 'specialty-routing',
    specialty: 'Orthopaedics',
    title: 'When to route to Orthopaedics',
    content:
      'Route to Orthopaedics for joint or bone pain, back or neck pain, sports injuries, reduced range of motion, swelling around a joint, suspected fractures or sprains, and chronic conditions like arthritis affecting mobility.',
  },

  // ---- triage red flags ----
  {
    category: 'triage',
    specialty: null,
    title: 'Cardiac red flags during intake',
    content:
      'Chest pain combined with shortness of breath, pain radiating to the arm or jaw, sweating, or nausea should be treated as a possible cardiac emergency. Instruct the patient to contact emergency services immediately rather than waiting for their scheduled appointment.',
  },
  {
    category: 'triage',
    specialty: null,
    title: 'Neurological red flags during intake',
    content:
      'Sudden facial drooping, arm weakness, slurred speech, sudden severe headache ("worst of my life"), or sudden vision loss are classic stroke warning signs and require immediate emergency care, not a routine appointment.',
  },
  {
    category: 'triage',
    specialty: null,
    title: 'Respiratory red flags during intake',
    content:
      'Severe difficulty breathing, blue-tinged lips or fingertips, or an inability to speak in full sentences due to breathlessness are emergencies. Routine intake should escalate these immediately rather than continuing the questionnaire.',
  },
  {
    category: 'triage',
    specialty: null,
    title: 'Mental health red flags during intake',
    content:
      'Any mention of suicidal thoughts, self-harm, or intent to harm others must be treated as urgent. The patient should be directed to emergency services or a crisis line immediately; the intake assistant should never attempt to manage this itself.',
  },
  {
    category: 'triage',
    specialty: null,
    title: 'Good intake questioning practice',
    content:
      'Effective intake asks one focused question at a time: what the main problem is, how long it has lasted (converted to a consistent unit like days), a severity rating from 1-10, relevant medical history, and current medications. Avoid compound questions that bundle multiple asks together — patients tend to answer only the first part.',
  },
  {
    category: 'triage',
    specialty: null,
    title: 'Medication reconciliation during intake',
    content:
      'When asking about current medications, prompt for dosage and frequency if the patient volunteers it, and explicitly ask about over-the-counter drugs and supplements, which patients often omit unless asked directly.',
  },

  // ---- documentation (SOAP + ICD hints) ----
  {
    category: 'documentation',
    specialty: null,
    title: 'Writing the Subjective section',
    content:
      'The Subjective section captures what the patient reports in their own words: chief complaint, history of present illness, duration, severity, and relevant history. It should never include the examiner\'s own observations or test results — those belong in Objective.',
  },
  {
    category: 'documentation',
    specialty: null,
    title: 'Writing the Objective section',
    content:
      'The Objective section is strictly measurable and observed data: vital signs, physical exam findings, and lab or imaging results. Avoid interpretation here — save clinical judgment for the Assessment section.',
  },
  {
    category: 'documentation',
    specialty: null,
    title: 'Writing the Assessment section',
    content:
      'The Assessment section states the clinician\'s interpretation: a diagnosis or differential diagnosis, and its severity or stage. It should logically follow from what was documented in Subjective and Objective, not introduce new unexamined findings.',
  },
  {
    category: 'documentation',
    specialty: null,
    title: 'Writing the Plan section',
    content:
      'The Plan section lists the concrete next steps: medications prescribed (with dose and duration), further tests ordered, referrals, patient education given, and the follow-up timeframe.',
  },
  {
    category: 'documentation',
    specialty: 'Orthopaedics',
    title: 'Common ICD-10 codes for musculoskeletal complaints',
    content:
      'Frequently used musculoskeletal ICD-10 codes include M54.5 (low back pain), M25.561/M25.562 (knee pain), M75.100 (rotator cuff syndrome), and S93.4 (ankle sprain). Match the code to the documented body site and laterality where possible.',
  },
  {
    category: 'documentation',
    specialty: 'Cardiology',
    title: 'Common ICD-10 codes for cardiovascular complaints',
    content:
      'Frequently used cardiology ICD-10 codes include I10 (essential hypertension), I25.10 (atherosclerotic heart disease), I48.91 (atrial fibrillation), and R07.9 (unspecified chest pain) when no cardiac diagnosis is yet confirmed.',
  },
  {
    category: 'documentation',
    specialty: 'Dermatology',
    title: 'Common ICD-10 codes for dermatologic complaints',
    content:
      'Frequently used dermatology ICD-10 codes include L20.9 (atopic dermatitis), L40.9 (psoriasis), L70.0 (acne vulgaris), and L57.0 (actinic keratosis) for suspicious sun-damaged lesions requiring follow-up.',
  },
  {
    category: 'documentation',
    specialty: 'General Practice',
    title: 'Common ICD-10 codes for general and preventive visits',
    content:
      'Frequently used general practice ICD-10 codes include Z00.00 (routine general exam), J06.9 (acute upper respiratory infection), R53.83 (fatigue), and Z23 (encounter for immunization).',
  },
];
