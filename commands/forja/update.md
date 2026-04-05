---
description: "Updates all Forja command files to the latest version."
argument-hint: ""
---

# Forja Update

Run the following command in the terminal:

```bash
curl -sL https://raw.githubusercontent.com/mobitech-services/forja/main/update.sh | bash
```

That's it. The script will:
- Overwrite all command files unconditionally
- Report which files were updated and which failed
- Update itself (`update.md`) as part of the run

No diff checks, no prompts.

---

## Troubleshooting

If the script reports `Forja is not installed in this project`, run the installer instead:

```bash
curl -sL https://raw.githubusercontent.com/mobitech-services/forja/main/install.sh | bash
```
