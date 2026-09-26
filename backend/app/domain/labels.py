"""Plain-language names for typologies (EN/HI), shared by services that write sentences."""

TYPOLOGY_PHRASE = {
    "RAPID_PASSTHROUGH": ("money moved in and out within a day", "एक दिन में पैसा आया और गया"),
    "PEP_UNUSUAL_CASH": ("unusual cash by politically exposed people", "राजनीतिक रूप से जुड़े लोगों का असामान्य नकद"),
    "ROUND_TRIPPING": ("money sent out and brought back in a loop", "पैसा घुमाकर वापस लाना"),
    "MULE_RING": ("accounts working together to move money", "मिलकर पैसा घुमाने वाले खाते"),
    "HIGH_RISK_SWIFT": ("transfers to high-risk countries", "उच्च जोखिम वाले देशों में ट्रांसफ़र"),
    "ACCOUNT_TAKEOVER": ("accounts possibly taken over", "खातों पर संभावित कब्ज़ा"),
    "STRUCTURING": ("cash split under the reporting limit", "सीमा से बचने के लिए नकद बाँटना"),
    "DORMANT_REACTIVATION": ("sleeping accounts suddenly active", "निष्क्रिय खाते अचानक सक्रिय"),
    "INCOME_MISMATCH": ("money far above declared income", "घोषित आय से कहीं ज़्यादा लेनदेन"),
    "CASH_REPORTING": ("large cash that must be reported", "बड़ा नकद लेनदेन जिसकी रिपोर्ट ज़रूरी है"),
    "KYC_CDD": ("customer checks out of date", "ग्राहक जाँच (KYC) पुरानी"),
    "WIRE_TRANSFER": ("wire transfer details missing", "वायर ट्रांसफ़र का विवरण अधूरा"),
    "GENERAL_AML": ("activity that doesn't fit the customer's profile", "ग्राहक की प्रोफ़ाइल से मेल न खाने वाली गतिविधि"),
    "SANCTIONS_SCREENING": ("possible match on a sanctions list", "प्रतिबंध सूची से संभावित मेल"),
}


def typology_phrase(code: str | None, lang: str = "en") -> str:
    en, hi = TYPOLOGY_PHRASE.get(code or "", ((code or "").replace("_", " ").lower(), (code or "")))
    return en if lang == "en" else hi
