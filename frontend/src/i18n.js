/**
 * Minimal i18n for English + Hindi.
 * Language stored in localStorage, synced with backend UserSettings.
 */

const translations = {
  en: {
    // Nav
    navUpload: "Prescription Upload",
    navHistory: "Medical History",
    navNotifications: "Notifications & Alerts",
    navAudit: "Access Log",
    navSettings: "Settings",

    // Upload panel
    uploadTitle: "Prescription Upload",
    uploadSubtitle: "Scan or photograph your prescription — medicines extracted automatically.",
    uploadDropTitle: "Drag & drop or choose a photo",
    uploadDropSub: "JPG or PNG · max 10 MB",
    uploadBtn: "Upload & Extract",
    uploadBtnLoading: "Reading prescription…",
    uploadTipsTitle: "Tips for best results",
    uploadTip1: "Good lighting — no shadows across the text",
    uploadTip2: "Hold camera steady; blurry images reduce accuracy",
    uploadTip3: "Capture full prescription including doctor name & date",

    // Verify modal
    verifyTitle: "Review Extracted Data",
    verifySubtitle: "Check the medicines below. Edit anything the AI got wrong before saving.",
    verifyConfidence: "Extraction confidence",
    verifyDoctor: "Doctor",
    verifyHospital: "Hospital",
    verifyDate: "Date",
    verifyMedicines: "Medicines",
    verifyMedName: "Medicine Name",
    verifyDose: "Dose",
    verifyFreq: "Frequency",
    verifyDuration: "Duration",
    verifyInstr: "Instructions",
    verifyAddMed: "+ Add medicine",
    verifyConfirm: "Save Prescription",
    verifyDiscard: "Discard",
    verifySaving: "Saving…",

    // History
    historyTitle: "Medical History",
    historyEmpty: "No prescriptions yet. Upload one to get started.",
    historyNoMatch: "No consultations match your filters.",
    historySearch: "Search medicine, doctor, hospital…",
    historyAllDoctors: "All doctors",
    historyAllHospitals: "All hospitals",
    historyFrom: "From",
    historyTo: "To",
    historyClear: "✕ Clear",
    interactionPatientTitle: "Potential Drug Interactions Detected",
    interactionPatientSubtitle: "Please review these warnings and consult your doctor before changing medicines.",

    // Notifications
    notifTitle: "Notifications & Alerts",
    notifSubtitle: "Today's medication schedule — updates every minute.",
    notifEmpty: "No medicines on record. Upload a prescription to activate reminders.",
    notifNoSchedule: "No doses scheduled — your prescriptions may not have frequency info.",
    notifEarlier: "Earlier today",
    notifEnableTitle: "Enable notifications",
    notifEnablePrompt: "Allow browser notifications to receive real-time medicine reminders.",
    notifAllowBtn: "Allow Notifications",

    // Audit log
    auditTitle: "Access Log",
    auditSubtitle: "Doctors who have viewed your records.",
    auditEmpty: "No access events recorded yet.",
    auditViewLog: "Viewed your medicine history",
    auditViewSummary: "Viewed your AI summary",
    auditViewInteractions: "Viewed your interaction safety report",

    // Settings
    settingsTitle: "Settings",
    settingsProfile: "Profile",
    settingsName: "Full name",
    settingsPhone: "Phone number",
    settingsRole: "Account type",
    settingsNotif: "Notifications",
    settingsNotifLabel: "Medication reminders",
    settingsNotifHint: "Get reminded to take medicines on time.",
    settingsReminderTime: "Daily reminder time",
    settingsLanguage: "Language",
    settingsSecurity: "Security",
    settingsPassword: "Password",
    settingsChangePassword: "Change password",
    settingsSave: "Save",
    settingsSaved: "Saved",
  },

  hi: {
    // Nav
    navUpload: "पर्चा अपलोड",
    navHistory: "चिकित्सा इतिहास",
    navNotifications: "सूचनाएं और अलर्ट",
    navAudit: "एक्सेस लॉग",
    navSettings: "सेटिंग्स",

    // Upload panel
    uploadTitle: "पर्चा अपलोड",
    uploadSubtitle: "अपने पर्चे की फोटो लें — दवाइयां स्वचालित रूप से निकाली जाएंगी।",
    uploadDropTitle: "फोटो खींचें या चुनें",
    uploadDropSub: "JPG या PNG · अधिकतम 10 MB",
    uploadBtn: "अपलोड करें",
    uploadBtnLoading: "पर्चा पढ़ा जा रहा है…",
    uploadTipsTitle: "बेहतर परिणामों के लिए सुझाव",
    uploadTip1: "अच्छी रोशनी — पाठ पर कोई छाया नहीं",
    uploadTip2: "कैमरा स्थिर रखें; धुंधली तस्वीरें सटीकता कम करती हैं",
    uploadTip3: "डॉक्टर का नाम और तारीख सहित पूरा पर्चा कैप्चर करें",

    // Verify modal
    verifyTitle: "निकाला गया डेटा जांचें",
    verifySubtitle: "नीचे दी गई दवाइयां जांचें। सहेजने से पहले AI की कोई गलती सुधारें।",
    verifyConfidence: "निष्कर्षण विश्वास",
    verifyDoctor: "डॉक्टर",
    verifyHospital: "अस्पताल",
    verifyDate: "तारीख",
    verifyMedicines: "दवाइयां",
    verifyMedName: "दवा का नाम",
    verifyDose: "खुराक",
    verifyFreq: "आवृत्ति",
    verifyDuration: "अवधि",
    verifyInstr: "निर्देश",
    verifyAddMed: "+ दवा जोड़ें",
    verifyConfirm: "पर्चा सहेजें",
    verifyDiscard: "रद्द करें",
    verifySaving: "सहेजा जा रहा है…",

    // History
    historyTitle: "चिकित्सा इतिहास",
    historyEmpty: "अभी तक कोई पर्चा नहीं। एक अपलोड करने के लिए शुरुआत करें।",
    historyNoMatch: "आपके फ़िल्टर से कोई परामर्श मेल नहीं खाता।",
    historySearch: "दवा, डॉक्टर, अस्पताल खोजें…",
    historyAllDoctors: "सभी डॉक्टर",
    historyAllHospitals: "सभी अस्पताल",
    historyFrom: "से",
    historyTo: "तक",
    historyClear: "✕ साफ करें",
    interactionPatientTitle: "संभावित दवा परस्पर क्रियाएं मिलीं",
    interactionPatientSubtitle: "इन चेतावनियों की समीक्षा करें और दवाओं में बदलाव से पहले अपने डॉक्टर से सलाह लें।",

    // Notifications
    notifTitle: "सूचनाएं और अलर्ट",
    notifSubtitle: "आज का दवाई कार्यक्रम — हर मिनट अपडेट होता है।",
    notifEmpty: "कोई दवाई दर्ज नहीं। रिमाइंडर सक्रिय करने के लिए पर्चा अपलोड करें।",
    notifNoSchedule: "कोई खुराक निर्धारित नहीं — आपके पर्चे में आवृत्ति जानकारी नहीं हो सकती।",
    notifEarlier: "आज पहले",
    notifEnableTitle: "सूचनाएं सक्षम करें",
    notifEnablePrompt: "वास्तविक समय दवाई रिमाइंडर प्राप्त करने के लिए ब्राउज़र सूचनाओं की अनुमति दें।",
    notifAllowBtn: "सूचनाओं की अनुमति दें",

    // Audit log
    auditTitle: "एक्सेस लॉग",
    auditSubtitle: "जिन डॉक्टरों ने आपके रिकॉर्ड देखे।",
    auditEmpty: "अभी तक कोई एक्सेस घटना दर्ज नहीं।",
    auditViewLog: "आपका दवाई इतिहास देखा",
    auditViewSummary: "आपका AI सारांश देखा",
    auditViewInteractions: "आपकी इंटरैक्शन सुरक्षा रिपोर्ट देखी",

    // Settings
    settingsTitle: "सेटिंग्स",
    settingsProfile: "प्रोफाइल",
    settingsName: "पूरा नाम",
    settingsPhone: "फोन नंबर",
    settingsRole: "खाता प्रकार",
    settingsNotif: "सूचनाएं",
    settingsNotifLabel: "दवाई रिमाइंडर",
    settingsNotifHint: "समय पर दवाई लेने के लिए याद दिलाएं।",
    settingsReminderTime: "दैनिक रिमाइंडर समय",
    settingsLanguage: "भाषा",
    settingsSecurity: "सुरक्षा",
    settingsPassword: "पासवर्ड",
    settingsChangePassword: "पासवर्ड बदलें",
    settingsSave: "सहेजें",
    settingsSaved: "सहेजा गया",
  },
};

export function getLang() {
  return localStorage.getItem("smartrx_lang") || "en";
}

export function setLang(lang) {
  localStorage.setItem("smartrx_lang", lang);
}

export function t(key) {
  const lang = getLang();
  return (translations[lang] || translations.en)[key] || key;
}

export function useTranslation() {
  return { t, lang: getLang() };
}
