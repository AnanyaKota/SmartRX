/**
 * medicalMapping.js — maps medicines & AI-inferred conditions onto body regions.
 *
 * The BodyMap component renders a human figure; this module decides WHICH
 * regions light up, WHY (conditions + medicines), and HOW urgently (severity).
 *
 * Matching is keyword-based over medicine names (generic + common Indian
 * brands) and condition names from the AI summary. Everything is lowercase
 * substring matching — prescription text is messy, so we stay forgiving.
 */

/* ── Body regions ─────────────────────────────────────────────────────────
   `anchor` is [x, y] in the BodyMap SVG viewBox (0 0 420 920).
   `side` picks which margin the callout label docks to.               */
export const BODY_REGIONS = {
  brain: {
    id: "brain",
    label: "Brain & Nervous System",
    short: "Brain",
    anchor: [210, 78],
    side: "R",
    organs: ["org-brain"],
    blurb: "Cognition, mood, seizures, migraine and nerve signalling.",
  },
  eyes: {
    id: "eyes",
    label: "Eyes",
    short: "Eyes",
    anchor: [193, 96],
    side: "L",
    organs: ["org-eyes"],
    blurb: "Vision, eye pressure and surface health.",
  },
  ent: {
    id: "ent",
    label: "Ear, Nose & Throat",
    short: "ENT",
    anchor: [210, 128],
    side: "L",
    organs: ["org-throat"],
    blurb: "Sinuses, throat, tonsils and ears.",
  },
  thyroid: {
    id: "thyroid",
    label: "Thyroid",
    short: "Thyroid",
    anchor: [210, 168],
    side: "R",
    organs: ["org-thyroid"],
    blurb: "Metabolic hormone regulation.",
  },
  heart: {
    id: "heart",
    label: "Heart & Circulation",
    short: "Heart",
    anchor: [227, 280],
    side: "R",
    organs: ["org-heart"],
    blurb: "Blood pressure, rhythm, cholesterol and cardiac output.",
  },
  lungs: {
    id: "lungs",
    label: "Lungs & Airways",
    short: "Lungs",
    anchor: [178, 268],
    side: "L",
    organs: ["org-lung-l", "org-lung-r"],
    blurb: "Breathing, airways and oxygen exchange.",
  },
  liver: {
    id: "liver",
    label: "Liver",
    short: "Liver",
    anchor: [180, 352],
    side: "L",
    organs: ["org-liver"],
    blurb: "Detoxification, bile and metabolic processing.",
  },
  stomach: {
    id: "stomach",
    label: "Stomach & Digestion",
    short: "Stomach",
    anchor: [235, 352],
    side: "R",
    organs: ["org-stomach"],
    blurb: "Acidity, reflux, gastric lining and digestion.",
  },
  pancreas: {
    id: "pancreas",
    label: "Pancreas & Blood Sugar",
    short: "Pancreas",
    anchor: [218, 380],
    side: "R",
    organs: ["org-pancreas"],
    blurb: "Insulin production and glucose control.",
  },
  kidneys: {
    id: "kidneys",
    label: "Kidneys & Urinary",
    short: "Kidneys",
    anchor: [252, 400],
    side: "R",
    organs: ["org-kidney-l", "org-kidney-r"],
    blurb: "Filtration, fluid balance and urinary tract.",
  },
  intestines: {
    id: "intestines",
    label: "Intestines & Gut",
    short: "Gut",
    anchor: [210, 445],
    side: "L",
    organs: ["org-intestines"],
    blurb: "Absorption, gut flora and bowel habit.",
  },
  bladder: {
    id: "bladder",
    label: "Bladder & Urinary Tract",
    short: "Bladder",
    anchor: [210, 498],
    side: "R",
    organs: ["org-bladder"],
    blurb: "Urine storage and lower urinary tract.",
  },
  blood: {
    id: "blood",
    label: "Blood & Immunity",
    short: "Blood",
    anchor: [173, 310],
    side: "L",
    organs: [],
    blurb: "Haemoglobin, clotting, infection defence.",
  },
  muscles: {
    id: "muscles",
    label: "Muscles",
    short: "Muscles",
    anchor: [138, 235],
    side: "L",
    organs: [],
    blurb: "Muscle tone, spasm and recovery.",
  },
  joints: {
    id: "joints",
    label: "Joints & Bones",
    short: "Joints",
    anchor: [166, 660],
    side: "L",
    organs: ["org-knee-l", "org-knee-r"],
    blurb: "Cartilage, inflammation and bone density.",
  },
  skin: {
    id: "skin",
    label: "Skin",
    short: "Skin",
    anchor: [110, 380],
    side: "L",
    organs: [],
    blurb: "Dermatological health and allergic skin reactions.",
  },
  reproductive: {
    id: "reproductive",
    label: "Reproductive & Hormonal",
    short: "Hormonal",
    anchor: [210, 520],
    side: "R",
    organs: [],
    blurb: "Reproductive organs and hormonal balance.",
  },
  systemic: {
    id: "systemic",
    label: "General & Systemic",
    short: "Systemic",
    anchor: [255, 320],
    side: "R",
    organs: [],
    blurb: "Whole-body effects: fever, vitamins, general recovery.",
  },
};

/* ── Medicine dictionary ──────────────────────────────────────────────────
   match: lowercase substrings tested against the medicine name.
   purpose: short human label shown in the detail panel.
   regions: which body regions this medicine implicates.
   weight: how strongly it flags the region (default 1).             */
const MED_RULES = [
  // — Diabetes —
  { match: ["metformin", "glycomet", "glucophage"], purpose: "Blood sugar control", regions: ["pancreas"], weight: 1.4 },
  { match: ["glimepiride", "amaryl", "gliclazide", "glipizide", "glibenclamide"], purpose: "Stimulates insulin release", regions: ["pancreas"], weight: 1.4 },
  { match: ["sitagliptin", "vildagliptin", "linagliptin", "teneligliptin", "januvia"], purpose: "Blood sugar control (DPP-4)", regions: ["pancreas"], weight: 1.3 },
  { match: ["dapagliflozin", "empagliflozin", "canagliflozin"], purpose: "Sugar excretion via kidneys", regions: ["pancreas", "kidneys"], weight: 1.3 },
  { match: ["insulin", "lantus", "novomix", "actrapid", "huminsulin"], purpose: "Insulin replacement", regions: ["pancreas"], weight: 1.8 },
  { match: ["pioglitazone"], purpose: "Insulin sensitiser", regions: ["pancreas"], weight: 1.2 },

  // — Blood pressure / cardiac —
  { match: ["amlodipine", "amlong", "amlokind", "cilnidipine", "nifedipine"], purpose: "Lowers blood pressure", regions: ["heart"], weight: 1.4 },
  { match: ["telmisartan", "telma", "losartan", "olmesartan", "valsartan", "irbesartan"], purpose: "Lowers blood pressure (ARB)", regions: ["heart"], weight: 1.4 },
  { match: ["ramipril", "enalapril", "lisinopril", "perindopril"], purpose: "Lowers blood pressure (ACE)", regions: ["heart"], weight: 1.4 },
  { match: ["atenolol", "metoprolol", "nebivolol", "bisoprolol", "carvedilol", "propranolol"], purpose: "Slows heart rate / BP", regions: ["heart"], weight: 1.4 },
  { match: ["hydrochlorothiazide", "chlorthalidone", "indapamide"], purpose: "Diuretic for blood pressure", regions: ["heart", "kidneys"], weight: 1.2 },
  { match: ["furosemide", "lasix", "torsemide", "spironolactone"], purpose: "Removes excess fluid", regions: ["heart", "kidneys"], weight: 1.4 },
  { match: ["atorvastatin", "atorva", "rosuvastatin", "rosuva", "simvastatin", "statin"], purpose: "Lowers cholesterol", regions: ["heart"], weight: 1.3 },
  { match: ["aspirin", "ecosprin", "clopidogrel", "clopitab", "ticagrelor", "prasugrel"], purpose: "Prevents blood clots", regions: ["heart", "blood"], weight: 1.5 },
  { match: ["warfarin", "acitrom", "rivaroxaban", "apixaban", "dabigatran"], purpose: "Blood thinner", regions: ["blood", "heart"], weight: 1.8 },
  { match: ["nitroglycerin", "sorbitrate", "isosorbide", "nitrocontin"], purpose: "Relieves chest pain (angina)", regions: ["heart"], weight: 1.8 },
  { match: ["digoxin"], purpose: "Strengthens heartbeat", regions: ["heart"], weight: 1.8 },
  { match: ["amiodarone", "diltiazem", "verapamil"], purpose: "Controls heart rhythm", regions: ["heart"], weight: 1.6 },

  // — Respiratory —
  { match: ["salbutamol", "albuterol", "asthalin", "levosalbutamol", "levolin"], purpose: "Opens airways (reliever)", regions: ["lungs"], weight: 1.5 },
  { match: ["budesonide", "budecort", "fluticasone", "beclomethasone", "ciclesonide"], purpose: "Reduces airway inflammation", regions: ["lungs"], weight: 1.4 },
  { match: ["formoterol", "salmeterol", "foracort", "seroflo", "duolin"], purpose: "Long-acting airway opener", regions: ["lungs"], weight: 1.4 },
  { match: ["montelukast", "montair", "montek"], purpose: "Asthma / allergy control", regions: ["lungs"], weight: 1.2 },
  { match: ["theophylline", "doxofylline", "deriphyllin"], purpose: "Relaxes airway muscles", regions: ["lungs"], weight: 1.2 },
  { match: ["tiotropium", "ipratropium"], purpose: "COPD airway opener", regions: ["lungs"], weight: 1.4 },
  { match: ["ambroxol", "bromhexine", "guaifenesin", "mucolite", "grilinctus", "ascoril", "benadryl cough"], purpose: "Loosens mucus / cough relief", regions: ["lungs"], weight: 1 },
  { match: ["dextromethorphan", "codeine"], purpose: "Cough suppressant", regions: ["lungs"], weight: 1 },
  { match: ["rifampicin", "isoniazid", "pyrazinamide", "ethambutol", "akt-4", "akt4"], purpose: "Tuberculosis treatment", regions: ["lungs"], weight: 2 },

  // — Gastro —
  { match: ["pantoprazole", "pantop", "pan 40", "pan40", "omeprazole", "rabeprazole", "esomeprazole", "razo"], purpose: "Reduces stomach acid", regions: ["stomach"], weight: 1.3 },
  { match: ["ranitidine", "famotidine", "aciloc"], purpose: "Reduces stomach acid", regions: ["stomach"], weight: 1.2 },
  { match: ["domperidone", "ondansetron", "emeset", "vomikind"], purpose: "Controls nausea / vomiting", regions: ["stomach"], weight: 1.1 },
  { match: ["sucralfate", "antacid", "gelusil", "digene", "mucaine"], purpose: "Protects stomach lining", regions: ["stomach"], weight: 1 },
  { match: ["loperamide", "racecadotril"], purpose: "Controls diarrhoea", regions: ["intestines"], weight: 1.2 },
  { match: ["lactulose", "looz", "isabgol", "bisacodyl", "cremaffin"], purpose: "Relieves constipation", regions: ["intestines"], weight: 1 },
  { match: ["mesalamine", "mesalazine", "rifaximin", "rcifax"], purpose: "Gut inflammation / flora", regions: ["intestines"], weight: 1.5 },
  { match: ["metronidazole", "flagyl", "tinidazole", "ornidazole"], purpose: "Gut / anaerobic infection", regions: ["intestines"], weight: 1.2 },
  { match: ["albendazole", "mebendazole", "zentel"], purpose: "Deworming", regions: ["intestines"], weight: 1 },
  { match: ["ursodeoxycholic", "udiliv", "silymarin", "liv 52", "liv52", "hepamerz"], purpose: "Liver support", regions: ["liver"], weight: 1.5 },

  // — Thyroid —
  { match: ["levothyroxine", "thyronorm", "eltroxin", "thyrox"], purpose: "Thyroid hormone replacement", regions: ["thyroid"], weight: 1.6 },
  { match: ["carbimazole", "methimazole", "neo-mercazole", "neomercazole"], purpose: "Reduces thyroid overactivity", regions: ["thyroid"], weight: 1.6 },

  // — Neuro / psych —
  { match: ["sertraline", "fluoxetine", "escitalopram", "nexito", "paroxetine", "venlafaxine", "desvenlafaxine", "duloxetine", "mirtazapine", "bupropion"], purpose: "Mood / anxiety support", regions: ["brain"], weight: 1.4 },
  { match: ["amitriptyline", "nortriptyline", "tryptomer"], purpose: "Mood / nerve pain", regions: ["brain"], weight: 1.3 },
  { match: ["alprazolam", "clonazepam", "diazepam", "lorazepam", "etizolam", "restyl"], purpose: "Anxiety / sleep aid", regions: ["brain"], weight: 1.3 },
  { match: ["zolpidem", "zopiclone", "melatonin"], purpose: "Sleep aid", regions: ["brain"], weight: 1.1 },
  { match: ["olanzapine", "risperidone", "quetiapine", "aripiprazole", "haloperidol", "lithium"], purpose: "Mood / thought stabiliser", regions: ["brain"], weight: 1.6 },
  { match: ["levetiracetam", "levipil", "phenytoin", "eptoin", "carbamazepine", "tegretol", "oxcarbazepine", "valproate", "valproic", "encorate", "lamotrigine", "topiramate"], purpose: "Seizure control", regions: ["brain"], weight: 1.8 },
  { match: ["gabapentin", "pregabalin", "pregaba", "lyrica"], purpose: "Nerve pain relief", regions: ["brain"], weight: 1.3 },
  { match: ["sumatriptan", "rizatriptan", "naratriptan", "flunarizine", "vasograin"], purpose: "Migraine treatment", regions: ["brain"], weight: 1.4 },
  { match: ["donepezil", "memantine", "rivastigmine"], purpose: "Memory support", regions: ["brain"], weight: 1.6 },
  { match: ["levodopa", "syndopa", "carbidopa", "ropinirole", "pramipexole"], purpose: "Parkinson's management", regions: ["brain"], weight: 1.8 },
  { match: ["betahistine", "vertin", "stugeron", "cinnarizine"], purpose: "Vertigo / balance", regions: ["ent", "brain"], weight: 1.1 },
  { match: ["methylcobalamin", "neurobion", "nervup", "nurokind"], purpose: "Nerve vitamin support", regions: ["brain", "blood"], weight: 0.8 },

  // — Pain / musculoskeletal —
  { match: ["paracetamol", "acetaminophen", "dolo", "crocin", "calpol", "pcm"], purpose: "Fever / pain relief", regions: ["systemic"], weight: 0.8 },
  { match: ["ibuprofen", "brufen", "combiflam", "diclofenac", "voveran", "aceclofenac", "zerodol", "naproxen", "ketorolac", "indomethacin", "piroxicam", "nimesulide"], purpose: "Anti-inflammatory pain relief", regions: ["joints", "muscles"], weight: 1.2 },
  { match: ["etoricoxib", "celecoxib", "etoshine"], purpose: "Joint pain (COX-2)", regions: ["joints"], weight: 1.3 },
  { match: ["tramadol", "ultracet", "tapentadol"], purpose: "Strong pain relief", regions: ["brain", "systemic"], weight: 1.3 },
  { match: ["thiocolchicoside", "chlorzoxazone", "cyclobenzaprine", "tizanidine", "baclofen", "myoril"], purpose: "Muscle relaxant", regions: ["muscles"], weight: 1.3 },
  { match: ["methotrexate", "hydroxychloroquine", "hcqs", "sulfasalazine", "leflunomide"], purpose: "Autoimmune arthritis control", regions: ["joints", "blood"], weight: 1.8 },
  { match: ["allopurinol", "zyloric", "febuxostat", "colchicine"], purpose: "Gout / uric acid control", regions: ["joints"], weight: 1.4 },
  { match: ["alendronate", "risedronate", "zoledronic", "denosumab"], purpose: "Bone density treatment", regions: ["joints"], weight: 1.5 },
  { match: ["calcium", "shelcal", "calcirol", "cholecalciferol", "vitamin d", "vit d3", "uprise"], purpose: "Bone / calcium support", regions: ["joints"], weight: 0.8 },
  { match: ["glucosamine", "collagen"], purpose: "Joint cartilage support", regions: ["joints"], weight: 0.8 },

  // — Antibiotics / anti-infectives —
  { match: ["amoxicillin", "amoxyclav", "augmentin", "moxikind", "clavam"], purpose: "Antibiotic", regions: ["blood"], weight: 1.1 },
  { match: ["azithromycin", "azithral", "azee", "clarithromycin", "erythromycin"], purpose: "Antibiotic", regions: ["blood", "lungs"], weight: 1.1 },
  { match: ["cefixime", "taxim", "cefuroxime", "ceftriaxone", "cephalexin", "cefpodoxime", "zifi"], purpose: "Antibiotic", regions: ["blood"], weight: 1.1 },
  { match: ["ciprofloxacin", "levofloxacin", "moxifloxacin", "ofloxacin"], purpose: "Antibiotic", regions: ["blood"], weight: 1.1 },
  { match: ["norfloxacin", "nitrofurantoin", "fosfomycin"], purpose: "Urinary tract antibiotic", regions: ["bladder"], weight: 1.4 },
  { match: ["doxycycline", "minocycline", "tetracycline"], purpose: "Antibiotic", regions: ["blood", "skin"], weight: 1.1 },
  { match: ["fluconazole", "itraconazole", "terbinafine", "ketoconazole", "griseofulvin", "candid"], purpose: "Antifungal", regions: ["skin"], weight: 1.2 },
  { match: ["acyclovir", "valacyclovir", "oseltamivir"], purpose: "Antiviral", regions: ["blood"], weight: 1.2 },
  { match: ["artemether", "lumefantrine", "chloroquine", "primaquine"], purpose: "Antimalarial", regions: ["blood"], weight: 1.5 },

  // — Allergy / immune —
  { match: ["cetirizine", "cetzine", "levocetirizine", "loratadine", "desloratadine", "fexofenadine", "allegra", "chlorpheniramine", "avil", "hydroxyzine", "atarax"], purpose: "Allergy relief", regions: ["blood", "skin"], weight: 1 },
  { match: ["prednisolone", "wysolone", "methylprednisolone", "dexamethasone", "deflazacort", "omnacortil"], purpose: "Steroid — inflammation control", regions: ["blood", "systemic"], weight: 1.6 },

  // — Skin —
  { match: ["betamethasone", "clobetasol", "mometasone", "hydrocortisone", "halobetasol"], purpose: "Skin inflammation (steroid)", regions: ["skin"], weight: 1.2 },
  { match: ["tretinoin", "adapalene", "benzoyl", "isotretinoin", "clindamycin gel", "acnestar"], purpose: "Acne treatment", regions: ["skin"], weight: 1.2 },
  { match: ["tacrolimus", "pimecrolimus", "calamine", "moisturex"], purpose: "Skin barrier / eczema", regions: ["skin"], weight: 1.1 },
  { match: ["permethrin", "scabper"], purpose: "Scabies / parasites", regions: ["skin"], weight: 1.2 },

  // — Eyes —
  { match: ["latanoprost", "brimonidine", "dorzolamide", "eye drop", "eyedrop", "refresh tears", "carboxymethylcellulose", "moxifloxacin eye", "tobramycin"], purpose: "Eye treatment", regions: ["eyes"], weight: 1.3 },

  // — Urinary / reproductive —
  { match: ["tamsulosin", "urimax", "silodosin", "finasteride", "dutasteride"], purpose: "Prostate / urine flow", regions: ["bladder", "reproductive"], weight: 1.4 },
  { match: ["sildenafil", "tadalafil"], purpose: "Erectile / vascular support", regions: ["reproductive"], weight: 1.1 },
  { match: ["norethisterone", "medroxyprogesterone", "regestrone", "oral contraceptive", "ovral"], purpose: "Hormonal regulation", regions: ["reproductive"], weight: 1.3 },
  { match: ["clomiphene", "letrozole"], purpose: "Fertility support", regions: ["reproductive"], weight: 1.3 },

  // — Blood / vitamins —
  { match: ["ferrous", "iron", "orofer", "livogen", "fefol"], purpose: "Iron for haemoglobin", regions: ["blood"], weight: 1.2 },
  { match: ["folic acid", "folvite"], purpose: "Folate supplement", regions: ["blood"], weight: 1 },
  { match: ["vitamin b12", "cyanocobalamin"], purpose: "B12 supplement", regions: ["blood"], weight: 1 },
  { match: ["multivitamin", "becosules", "zincovit", "supradyn", "revital", "vitamin c", "limcee", "zinc"], purpose: "General vitamin support", regions: ["systemic"], weight: 0.6 },
];

/* ── Condition dictionary ────────────────────────────────────────────────
   Applied to condition names coming from the AI summary.            */
const CONDITION_RULES = [
  { match: ["diabetes", "diabetic", "hyperglycemia", "hba1c", "sugar"], regions: ["pancreas"], weight: 2 },
  { match: ["hypertension", "high blood pressure", "htn", "bp"], regions: ["heart"], weight: 2 },
  { match: ["cholesterol", "dyslipidemia", "hyperlipidemia", "lipid"], regions: ["heart"], weight: 1.6 },
  { match: ["heart", "cardiac", "angina", "coronary", "arrhythmia", "atrial", "cardiomyopathy", "infarction", "chf", "failure"], regions: ["heart"], weight: 2.2 },
  { match: ["asthma", "wheez"], regions: ["lungs"], weight: 2 },
  { match: ["copd", "emphysema", "bronchitis", "bronchiectasis"], regions: ["lungs"], weight: 2 },
  { match: ["tuberculosis", "tb"], regions: ["lungs"], weight: 2.4 },
  { match: ["pneumonia", "respiratory infection", "covid"], regions: ["lungs"], weight: 2 },
  { match: ["cough", "cold", "flu", "viral fever"], regions: ["lungs", "systemic"], weight: 1 },
  { match: ["thyroid", "hypothyroid", "hyperthyroid", "goiter", "goitre", "hashimoto"], regions: ["thyroid"], weight: 2 },
  { match: ["migraine", "headache"], regions: ["brain"], weight: 1.6 },
  { match: ["epilepsy", "seizure", "convulsion"], regions: ["brain"], weight: 2.4 },
  { match: ["depression", "anxiety", "insomnia", "bipolar", "schizophrenia", "panic", "ocd", "stress"], regions: ["brain"], weight: 1.8 },
  { match: ["parkinson", "alzheimer", "dementia", "tremor"], regions: ["brain"], weight: 2.4 },
  { match: ["stroke", "tia", "cerebrovascular"], regions: ["brain", "heart"], weight: 2.4 },
  { match: ["neuropathy", "neuralgia", "sciatica", "nerve"], regions: ["brain"], weight: 1.6 },
  { match: ["vertigo", "tinnitus", "meniere"], regions: ["ent"], weight: 1.4 },
  { match: ["sinusitis", "tonsillitis", "pharyngitis", "laryngitis", "otitis", "ear infection", "rhinitis", "sore throat"], regions: ["ent"], weight: 1.4 },
  { match: ["gastritis", "gerd", "reflux", "acidity", "ulcer", "dyspepsia", "gastric"], regions: ["stomach"], weight: 1.8 },
  { match: ["ibs", "colitis", "constipation", "diarrhea", "diarrhoea", "bowel", "crohn"], regions: ["intestines"], weight: 1.8 },
  { match: ["hepatitis", "fatty liver", "cirrhosis", "jaundice", "liver"], regions: ["liver"], weight: 2.2 },
  { match: ["pancreatitis"], regions: ["pancreas"], weight: 2.4 },
  { match: ["kidney", "renal", "ckd", "nephro", "dialysis"], regions: ["kidneys"], weight: 2.4 },
  { match: ["kidney stone", "renal calculi", "urolithiasis"], regions: ["kidneys", "bladder"], weight: 2 },
  { match: ["uti", "urinary", "cystitis", "prostate", "bph"], regions: ["bladder"], weight: 1.8 },
  { match: ["arthritis", "osteoarthritis", "rheumatoid", "gout", "joint", "spondyl", "knee pain", "back pain"], regions: ["joints"], weight: 1.8 },
  { match: ["osteoporosis", "osteopenia", "fracture", "bone"], regions: ["joints"], weight: 1.8 },
  { match: ["muscle", "myalgia", "spasm", "sprain", "strain", "fibromyalgia"], regions: ["muscles"], weight: 1.4 },
  { match: ["anemia", "anaemia", "haemoglobin", "hemoglobin", "thalassemia"], regions: ["blood"], weight: 1.8 },
  { match: ["infection", "sepsis", "fever", "typhoid", "dengue", "malaria"], regions: ["blood"], weight: 1.6 },
  { match: ["allergy", "allergic", "urticaria", "hives"], regions: ["blood", "skin"], weight: 1.2 },
  { match: ["dermatitis", "eczema", "psoriasis", "acne", "fungal", "rash", "skin"], regions: ["skin"], weight: 1.6 },
  { match: ["conjunctivitis", "glaucoma", "cataract", "eye", "vision", "myopia"], regions: ["eyes"], weight: 1.6 },
  { match: ["pcos", "pcod", "menstrual", "pregnancy", "fertility", "menopause"], regions: ["reproductive"], weight: 1.8 },
  { match: ["obesity", "weight", "fatigue", "weakness", "vitamin deficiency", "malnutrition"], regions: ["systemic"], weight: 1 },
];

/* ── Matching helpers ── */
function matchRules(text, rules) {
  const s = (text || "").toLowerCase();
  if (!s.trim()) return [];
  const hits = [];
  for (const rule of rules) {
    if (rule.match.some((kw) => s.includes(kw))) hits.push(rule);
  }
  return hits;
}

function sevRank(sev) {
  return sev === "severe" ? 3 : sev === "moderate" ? 2 : 1;
}

/**
 * analyzeHealth — the single entry point.
 *
 * @param {object[]} prescriptions  raw prescription rows (with .medicines[])
 * @param {object|null} structured  AI StructuredSummary (conditions, current_medicines, interactions)
 * @param {object[]} interactions   DrugInteraction[] (patient report or structured.interactions)
 * @returns {{ findings: object[], meta: object }}
 *   findings: sorted by severity desc — [{ region, regionDef, severity, score,
 *              conditions: [{name, status}], medicines: [{name, purpose, dose, frequency}],
 *              interactions: [ix...] }]
 */
export function analyzeHealth({ prescriptions = [], structured = null, interactions = [] } = {}) {
  const regions = new Map(); // regionId -> accumulator

  const bucket = (regionId) => {
    if (!regions.has(regionId)) {
      regions.set(regionId, {
        region: regionId,
        regionDef: BODY_REGIONS[regionId],
        score: 0,
        conditions: [],
        medicines: [],
        interactions: [],
        worsening: false,
      });
    }
    return regions.get(regionId);
  };

  /* 1. Medicines — dedupe by name across all prescriptions (latest first). */
  const seenMeds = new Map(); // lowercase name -> med object
  const source = structured?.current_medicines?.length
    ? structured.current_medicines.map((m) => ({ name: m.name, dose: m.dose, frequency: m.frequency, status: m.status }))
    : prescriptions.flatMap((rx) => rx.medicines || []);
  for (const med of source) {
    const key = (med.name || "").toLowerCase().trim();
    if (!key || seenMeds.has(key)) continue;
    seenMeds.set(key, med);
  }

  const unmatchedMeds = [];
  for (const [, med] of seenMeds) {
    const rules = matchRules(med.name, MED_RULES);
    if (!rules.length) {
      unmatchedMeds.push(med.name);
      continue;
    }
    for (const rule of rules) {
      for (const regionId of rule.regions) {
        const b = bucket(regionId);
        b.score += rule.weight ?? 1;
        if (!b.medicines.some((m) => m.name === med.name)) {
          b.medicines.push({
            name: med.name,
            purpose: rule.purpose,
            dose: med.dose || null,
            frequency: med.frequency || null,
            status: med.status || null,
          });
        }
      }
    }
  }

  /* 2. AI conditions — stronger signal than meds alone. */
  for (const cond of structured?.conditions || []) {
    const rules = matchRules(cond.name, CONDITION_RULES);
    for (const rule of rules) {
      for (const regionId of rule.regions) {
        const b = bucket(regionId);
        b.score += rule.weight ?? 1.5;
        if (cond.status === "worsening") b.worsening = true;
        if (!b.conditions.some((c) => c.name === cond.name)) {
          b.conditions.push({ name: cond.name, status: cond.status || "unknown" });
        }
      }
    }
  }

  /* 3. Drug interactions — attach to every region whose meds are involved. */
  for (const ix of interactions || []) {
    const ixMeds = (ix.medicines || []).map((m) => m.toLowerCase());
    for (const [, b] of regions) {
      const touches = b.medicines.some((m) =>
        ixMeds.some((im) => m.name.toLowerCase().includes(im) || im.includes(m.name.toLowerCase()))
      );
      if (touches) {
        b.interactions.push(ix);
        b.score += ix.severity === "severe" ? 3 : ix.severity === "moderate" ? 2 : 1;
      }
    }
  }

  /* 4. Grade severity per region. */
  const findings = [];
  for (const [, b] of regions) {
    if (!b.regionDef) continue;
    let severity = b.score >= 4 ? "severe" : b.score >= 2 ? "moderate" : "mild";
    if (b.worsening) severity = "severe";
    if (b.interactions.some((ix) => ix.severity === "severe")) severity = "severe";
    else if (severity === "mild" && b.interactions.length) severity = "moderate";
    findings.push({ ...b, severity });
  }

  findings.sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || b.score - a.score);

  return {
    findings,
    meta: {
      medCount: seenMeds.size,
      matchedRegions: findings.length,
      conditionCount: structured?.conditions?.length ?? 0,
      interactionCount: (interactions || []).length,
      unmatchedMeds,
    },
  };
}
