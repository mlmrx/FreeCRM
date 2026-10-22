"""Conservative source-preservation policy for public authored translation copy.

These exact source entries are program syntax, not natural-language consent or
safety instructions. Keeping them in English avoids changing executable tokens.
Natural-language explanations around code remain eligible for reviewed drafting.
"""

import re

PRESERVE_RULES = {
    "xml-document": re.compile(r"^(?:<\?xml\b|<item>\s*<title>)"),
    "http-protocol": re.compile(r"^(?:Bearer \{|attachment;\s*filename=|(?:connect|script)-src \{|[^\s;]+=\{[^}]+\}; Path=/;)"),
    "sql-expression": re.compile(r"^(?:AND\b.+(?:\?|\bNOT IN\s*\()|SELECT\b.+\bFROM\s+\w+|INSERT INTO\s+\w+\s*\(|UPDATE\s+\w+\s+SET\s+\w+\s*=|DELETE FROM\s+\w+\s+WHERE\b|CREATE TABLE(?: IF NOT EXISTS)?\s+\w+\s*\()"),
    "shell-command": re.compile(r"^(?:git clone |npm (?:ci|install|run) |npx (?:wrangler|vinext) )"),
    "confirmation-token": re.compile(r"^FREE-CRM:[a-z0-9:-]+(?:\s|$)"),
    "css-token": re.compile(r"^(?:nav-item|platform-persona persona-|record-avatar|status-chip status-|stage-dot|timeline-dot|integration-logo|workspace-reset|sidebar|toast) \{"),
}


def source_preservation_category(text):
    for category, pattern in PRESERVE_RULES.items():
        if pattern.search(text):
            return category
    return None


if __name__ == "__main__":
    import json
    from pathlib import Path

    source = json.loads(Path("locales/source.json").read_text(encoding="utf-8"))
    categories = {}
    for text in source:
        category = source_preservation_category(text)
        if category:
            categories.setdefault(category, []).append(text)
    report = {
        "sourceEntries": len(source),
        "preserveExactly": sum(map(len, categories.values())),
        "categories": categories,
        "note": "Program syntax only. Natural-language consent and safety prose still requires accurate translation.",
    }
    target = Path("output/localization-tools/source-preservation-report.json")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sourceEntries": len(source), "preserveExactly": report["preserveExactly"],
                      "categories": {key: len(values) for key, values in categories.items()}}))
