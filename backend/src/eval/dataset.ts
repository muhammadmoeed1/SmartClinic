/** Curated eval cases for the Smart Recommender and SOAP formatter. Kept
 * small and hand-written (not sampled from real patient data) since this is
 * a portfolio/demo project, not a clinical validation study. */

export interface RecommendCase {
  description: string;
  expectedSpecialty: string;
}

export const RECOMMEND_CASES: RecommendCase[] = [
  { description: 'Sharp chest pain and shortness of breath when climbing stairs', expectedSpecialty: 'Cardiology' },
  { description: 'A mole on my back has become darker and larger over the last month', expectedSpecialty: 'Dermatology' },
  { description: 'My knee has been swollen and painful since I twisted it playing football', expectedSpecialty: 'Orthopaedics' },
  { description: 'I just want a general checkup and my vaccinations updated', expectedSpecialty: 'General Practice' },
  { description: 'Persistent lower back pain for three weeks, worse when bending', expectedSpecialty: 'Orthopaedics' },
  { description: 'Itchy red rash on my arms that spreads a little more every day', expectedSpecialty: 'Dermatology' },
  { description: 'My heart races randomly throughout the day and I sometimes feel dizzy', expectedSpecialty: 'Cardiology' },
  { description: 'Feeling tired all the time, no specific symptom I can point to', expectedSpecialty: 'General Practice' },
  { description: 'Stiffness and pain in my shoulder joint that has worsened over two months', expectedSpecialty: 'Orthopaedics' },
  { description: 'Noticed my blood pressure readings at home have been consistently high', expectedSpecialty: 'Cardiology' },
];

export interface SoapCase {
  rawNotes: string;
  expectNonEmptySections: Array<'subjective' | 'objective' | 'assessment' | 'plan'>;
}

export const SOAP_CASES: SoapCase[] = [
  {
    rawNotes: 'pt c/o lower back pain x2wks, worse on bending, no radiation. exam: normal gait, tenderness L4-L5, SLR negative. assessment: mechanical low back pain. plan: NSAIDs, physio referral, review 2wks',
    expectNonEmptySections: ['subjective', 'objective', 'assessment', 'plan'],
  },
  {
    rawNotes: 'patient reports 3 day history of sore throat and fever 38.5C. exam shows red pharynx, no exudate. likely viral pharyngitis. advised rest, fluids, paracetamol prn, return if worsens.',
    expectNonEmptySections: ['subjective', 'objective', 'assessment', 'plan'],
  },
  {
    rawNotes: 'itchy rash both forearms for a week, no new soaps/detergents. exam: erythematous papular rash, no vesicles. dx contact dermatitis. rx topical hydrocortisone bd 1wk.',
    expectNonEmptySections: ['subjective', 'objective', 'assessment', 'plan'],
  },
];
