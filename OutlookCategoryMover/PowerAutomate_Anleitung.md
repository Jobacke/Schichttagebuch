# 📬 Power Automate: Kategorisierte Mails automatisch verschieben

## Übersicht

Dieses Flow prüft **alle 5 Minuten** den Ordner **"unkategorisiert"**.  
Sobald eine E-Mail dort eine **Kategorie zugewiesen** bekommt, wird sie automatisch  
in den **Posteingang** verschoben.

**Voraussetzungen:** Nur ein Microsoft 365 Konto – keine Adminrechte nötig.

---

## Schritt-für-Schritt-Anleitung

### 1. Power Automate öffnen

1. Gehe zu **[https://make.powerautomate.com](https://make.powerautomate.com)**
2. Melde dich mit deinem Microsoft 365 Konto an
3. Klicke links auf **"Meine Flows"** → **"+ Neuer Flow"** → **"Geplanter Cloudflow"**

### 2. Flow-Grundeinstellungen

| Feld | Wert |
|------|------|
| **Flowname** | `Kategorisierte Mails verschieben` |
| **Starten am** | *(heute, aktuelle Uhrzeit)* |
| **Wiederholen alle** | `5` **Minuten** |

Klicke **"Erstellen"**.

---

### 3. Aktion hinzufügen: "E-Mails abrufen (V3)"

1. Klicke **"+ Neuer Schritt"**
2. Suche nach **"E-Mails abrufen"**
3. Wähle **"E-Mails abrufen (V3)"** vom Connector **"Office 365 Outlook"**

Konfiguration:

| Feld | Wert |
|------|------|
| **Ordner** | Klicke auf das Ordner-Symbol → navigiere zum Ordner **"unkategorisiert"** |
| **Nur ungelesene** | `Nein` |
| **Oberste** | `25` |
| **Erweiterte Optionen anzeigen** | Ja, aufklappen |
| **Wichtigkeit** | *(leer lassen)* |
| **Abrufoptionen** | *(leer lassen)* |

> ⚠️ **WICHTIG:** Stelle sicher, dass "Nur ungelesene" auf **Nein** steht!  
> Sonst werden bereits gelesene, kategorisierte Mails ignoriert.

---

### 4. Aktion hinzufügen: "Auf alle anwenden" (Apply to each)

1. Klicke **"+ Neuer Schritt"**
2. Suche nach **"Auf alle anwenden"** (oder "Apply to each")
3. Im Feld **"Ausgabe aus vorherigen Schritten auswählen"**: Wähle **"value"** aus der  
   dynamischen Inhaltsliste der E-Mail-Aktion

---

### 5. Bedingung hinzufügen (INNERHALB von "Auf alle anwenden")

1. Klicke innerhalb des "Auf alle anwenden"-Blocks auf **"Aktion hinzufügen"**
2. Suche nach **"Bedingung"** (Condition)

#### ⚡ Die korrekte Bedingung konfigurieren:

**OPTION A – Einfache Methode (empfohlen):**

1. Klicke im linken Feld der Bedingung auf **"Ausdruck"** (Expression)
2. Gib **exakt** diesen Ausdruck ein:

```
length(coalesce(items('Auf_alle_anwenden')?['categories'], createArray()))
```

> ⚠️ **Hinweis zum Namen:** Der Name `Auf_alle_anwenden` muss dem internen Namen  
> deines "Apply to each"-Schritts entsprechen. Falls dein Flow auf Englisch ist,  
> heißt es `Apply_to_each`. Du kannst den korrekten Namen sehen, indem du auf die  
> drei Punkte (⋯) des "Auf alle anwenden"-Blocks klickst und unter  
> **"Einstellungen"** → **"Name"** nachschaust.

3. Klicke **"OK"**
4. Wähle als Operator: **"ist größer als"** (is greater than)
5. Im rechten Feld: gib `0` ein (als Ausdruck oder als Wert)

**Was dieser Ausdruck tut:**
- `items('...')?['categories']` → holt das Kategorien-Array der aktuellen E-Mail
- `coalesce(..., createArray())` → falls `categories` **null** ist, wird ein leeres Array verwendet (DAS war das Problem vorher!)
- `length(...)` → zählt die Anzahl der Kategorien
- `> 0` → prüft ob mindestens eine Kategorie zugewiesen ist

---

**OPTION B – Alternative falls Option A Probleme macht:**

1. Im linken Feld → **"Ausdruck"**:

```
string(coalesce(items('Auf_alle_anwenden')?['categories'], createArray()))
```

2. Operator: **"ist nicht gleich"** (is not equal to)
3. Rechtes Feld: `[]`

---

### 6. Im "Ja"-Zweig: E-Mail verschieben

1. Klicke innerhalb des **"Wenn ja"**-Zweigs auf **"Aktion hinzufügen"**
2. Suche nach **"E-Mail verschieben"**
3. Wähle **"E-Mail verschieben (V2)"** von **"Office 365 Outlook"**

Konfiguration:

| Feld | Wert |
|------|------|
| **Nachrichten-ID** | Wähle aus dynamischem Inhalt: **"Nachrichten-ID"** (oder "Message Id") |
| **Zielordner** | Klicke auf das Ordner-Symbol → wähle **"Posteingang"** (Inbox) |

### 7. Im "Nein"-Zweig: Nichts tun

Lasse den **"Wenn nein"**-Zweig leer. Mails ohne Kategorie bleiben einfach  
im Ordner "unkategorisiert" liegen.

---

### 8. Flow speichern und testen

1. Klicke oben rechts auf **"Speichern"**
2. Klicke auf **"Testen"** → **"Manuell"** → **"Testen"**
3. Der Flow läuft jetzt einmal durch

#### Testen:
1. Verschiebe eine Test-Mail in den Ordner **"unkategorisiert"**
2. Weise ihr in Outlook eine **Kategorie** zu (Rechtsklick → Kategorisieren → Kategorie wählen)
3. Starte den Flow manuell über **"Testen"**
4. Die Mail sollte jetzt im **Posteingang** erscheinen ✅

---

## Fehlerbehebung

### Problem: "items('Auf_alle_anwenden') wird nicht erkannt"

→ Der interne Name stimmt nicht. Du musst den **exakten** internen Namen verwenden.

**So findest du ihn:**
1. Klicke auf die **drei Punkte (⋯)** des "Auf alle anwenden"-Blocks
2. Wähle **"Peek code"** (Code einsehen / Codeansicht)
3. Dort siehst du den tatsächlichen Feldnamen, z.B.:
   ```json
   "foreach": "@body('E-Mails_abrufen_(V3)')?['value']"
   ```
4. Den Schleifen-Namen findest du im `actions`-Block über der Schleife

**Typische Namen:**
- Deutsch: `Auf_alle_anwenden`
- Englisch: `Apply_to_each`
- Falls umbenannt: der Name den du vergeben hast (Leerzeichen → `_`)

### Problem: "Der Ausdruck ist ungültig"

→ Prüfe auf Tippfehler. Kopiere den Ausdruck exakt:

```
length(coalesce(items('Auf_alle_anwenden')?['categories'], createArray()))
```

### Problem: "Flow läuft, aber verschiebt nichts"

1. Öffne den **Flow-Lauf** (unter "Meine Flows" → "28 Tage-Ausführungsverlauf")
2. Klicke auf einen Lauf um die Details zu sehen
3. Prüfe beim Schritt **"E-Mails abrufen (V3)"**: Werden E-Mails gefunden?
4. Prüfe die **Bedingung**: Was ist der Wert von `categories`?

> Wenn `categories` als `null` angezeigt wird, funktioniert der `coalesce`-Ausdruck  
> korrekt und behandelt es als leeres Array.

### Problem: "Kategorien werden nicht erkannt obwohl gesetzt"

→ Es kann 1-2 Minuten dauern bis Exchange die Kategoriezuweisung synchronisiert hat.  
Der Flow läuft alle 5 Minuten, sodass spätestens beim nächsten Durchlauf die  
Kategorie erkannt wird.

---

## Flow-Diagramm (Übersicht)

```
┌─────────────────────────────────────┐
│  ⏰ Zeitplan: Alle 5 Minuten        │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  📧 E-Mails abrufen (V3)           │
│  Ordner: "unkategorisiert"          │
│  Nur ungelesene: Nein               │
│  Oberste: 25                        │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  🔄 Auf alle anwenden (für jede     │
│     E-Mail im Ergebnis)             │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ ❓ Bedingung:                 │  │
│  │ length(coalesce(              │  │
│  │   categories, [])) > 0       │  │
│  └──────┬──────────┬────────────┘  │
│         │          │               │
│      ✅ JA      ❌ NEIN            │
│         │          │               │
│         ▼          ▼               │
│  ┌──────────┐  (nichts tun,       │
│  │ 📩 E-Mail │  Mail bleibt       │
│  │ verschieben│ in "unkat.")      │
│  │ → Inbox   │                    │
│  └──────────┘                     │
└─────────────────────────────────────┘
```

---

## Zusammenfassung

| Was | Detail |
|-----|--------|
| **Lösung** | Power Automate Geplanter Cloudflow |
| **Intervall** | Alle 5 Minuten |
| **Adminrechte** | ❌ Nicht nötig |
| **Azure-Registrierung** | ❌ Nicht nötig |
| **Drittanbieter-Software** | ❌ Nicht nötig |
| **Kosten** | ✅ In Microsoft 365 enthalten |
| **Funktioniert mit** | Neues Outlook für Mac ✅ |
