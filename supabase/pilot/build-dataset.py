"""Build the canonical AI&DS pilot dataset from the four source documents.

Reads the timetable workbook, the name list, the workload document and the floor duty
document, and emits `pilot-data.json` — everything the Node loader needs, fully resolved.

Run:  python supabase/pilot/build-dataset.py
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
# The four source documents live beside this script rather than in the repository root: they
# carry the full student roster, so the folder is gitignored.
ROOT = os.path.join(HERE, "source-documents")
OUT = os.path.join(HERE, "pilot-data.json")

DEPARTMENT_CODE = "AI&DS"
ACADEMIC_YEAR = "2026-2027"
EMAIL_DOMAIN = "login.vernex.in"
# The timetable's stated effective date; the odd semester runs to the end of November.
SEM_STARTS, SEM_ENDS = "2026-07-06", "2026-11-30"

PERIODS = [
    (1, "09:00", "09:50"), (2, "09:50", "10:40"), (3, "10:55", "11:45"),
    (4, "11:45", "12:35"), (5, "13:30", "14:20"), (6, "14:20", "15:10"),
    (7, "15:10", "16:00"),
]
BREAKS = [("Break", "10:40", "10:55", "break"), ("Lunch", "12:35", "13:30", "lunch")]
DAYS = {"MON": 1, "TUES": 2, "TUE": 2, "WED": 3, "THU": 4, "THUR": 4, "FRI": 5}

# sheet -> (roman year, section name, semester number, study year)
SHEET_SECTION = {
    "Year II - A": ("II", "A", 3, 2),
    "Year II - B": ("II", "B", 3, 2),
    "Year III":    ("III", "A", 5, 3),
    "Year IV":     ("IV", "A", 7, 4),
}
GRID = {
    "Year II - A": dict(row0=10, cols=[(2, 3), (4, 5), (7, 8), (9, 9), (12, 13), (14, 15), (16, 17)]),
    "Year II - B": dict(row0=11, cols=[(2, 3), (4, 5), (7, 8), (9, 9), (11, 12), (13, 14), (15, 16)]),
    "Year III":    dict(row0=13, cols=[(2, 3), (4, 5), (7, 8), (9, 10), (12, 13), (14, 15), (16, 16)]),
    "Year IV":     dict(row0=11, cols=[(2, 3), (4, 5), (7, 8), (9, 10), (12, 13), (14, 15), (16, 17)]),
    "Lab":         dict(row0=8,  cols=[(2, 2), (3, 3), (5, 5), (6, 6), (8, 8), (9, 9), (10, 10)]),
}
COURSE_ROWS = {
    "Year II - A": (18, 29), "Year II - B": (19, 30),
    "Year III": (21, 31), "Year IV": (19, 27), "Lab": (14, 26),
}

LAB_NAME = "JOHN Mc CARTHY"

# ---------------------------------------------------------------- faculty roster
# user_id / password follow the scheme the department chose: <name>_aids / <name>@aids.
# `key` is the normalised name used to match every spelling found in the documents.
FACULTY = [
    # key,           display name,                 user id,               designation,                              role
    ("krishnamurthy", "Dr. M. Krishnamurthy",      "krishnamurthy_aids",  "Professor & Head",                       "hod"),
    ("jasminepaul",   "Dr. Jasmine Paul",          "jasmine_aids",        "Associate Professor",                    "faculty"),
    ("aishwarya",     "Ms. S. Aishwarya",          "aishwarya_aids",      "Assistant Professor",                    "faculty"),
    ("krithikaa",     "Ms. V. S. Krithikaa Venket", "krithikaa_aids",     "Assistant Professor",                    "faculty"),
    ("ramani",        "Ms. S. Ramani",             "ramani_aids",         "Assistant Professor",                    "faculty"),
    ("sridevi",       "Ms. T. Sri Devi",           "sridevi_aids",        "Assistant Professor",                    "faculty"),
    ("priyadharshini", "Dr. R. Priyadharshini",    "priyadharshini_aids", "Assistant Professor",                    "faculty"),
    ("divya",         "Ms. M. Divya",              "divya_aids",          "Assistant Professor",                    "faculty"),
    # Faculty from other departments who teach AI&DS periods in this timetable.
    ("vijayarahavan", "Dr. Vijayarahavan",         "vijayarahavan_aids",  "Visiting Faculty - Mathematics",         "faculty"),
    ("baskar",        "Mr. Baskar",                "baskar_aids",         "Visiting Faculty - Mathematics",         "faculty"),
    ("aidajones",     "Dr. Aida Jones",            "aidajones_aids",      "Visiting Faculty - Computer Science",    "faculty"),
    ("shino",         "Dr. Shino",                 "shino_aids",          "Visiting Faculty - Placement & Training", "faculty"),
    ("draishwarya",   "Dr. Aishwarya",             "draishwarya_aids",    "Visiting Faculty - Placement & Training", "faculty"),
    ("sridhadhan",    "Dr. S. Sridhadhan",         "sridhadhan_aids",     "Visiting Faculty - Open Elective",       "faculty"),
    ("yokeshwari",    "Ms. Yokeshwari",            "yokeshwari_aids",     "Visiting Faculty - Aptitude & Training", "faculty"),
]
DEPARTMENT_KEYS = {"krishnamurthy", "jasminepaul", "aishwarya", "krithikaa", "ramani",
                   "sridevi", "priyadharshini", "divya"}

# Every spelling that appears across the documents, reduced to lowercase letters only
# (so "Ms. Sri Devi", "Ms.Sridevi" and "Ms. T Sri Devi" all collapse together) and mapped
# to a roster key. The title is deliberately kept in the canonical form, because
# "Dr.Aishwarya" and "Ms.Aishwarya" appear in the SAME sheet and so are treated as two
# different people. The HOD must confirm that reading.
NAME_ALIASES = {
    "drkrishnamurthym": "krishnamurthy", "drmkrishnamurthy": "krishnamurthy",
    "drjasminepaul": "jasminepaul",
    "msaishwarya": "aishwarya", "mssaishwarya": "aishwarya",
    "draishwarya": "draishwarya",
    "mskrithikaavenketvs": "krithikaa", "mskrithikaavenketvs2": "krithikaa",
    "krithikaa": "krithikaa", "msvskrithikaavenket": "krithikaa",
    "msramani": "ramani", "mssramani": "ramani", "ramani": "ramani",
    "mssridevi": "sridevi", "mstsridevi": "sridevi", "sridevi": "sridevi",
    "drpriyadharshini": "priyadharshini", "drrpriyadharshini": "priyadharshini",
    "msdivya": "divya", "divya": "divya",
    "drvijayarahavan": "vijayarahavan",
    "mrbaskar": "baskar",
    "draidajones": "aidajones",
    "drshino": "shino",
    "drssridhadhan": "sridhadhan",
    "msyokeshwari": "yokeshwari",
}

CLASS_TEACHER = {  # section key -> faculty key. III resolved to Sri Devi per the workload.
    ("II", "A"): "krithikaa",
    ("II", "B"): "ramani",
    ("III", "A"): "sridevi",
    ("IV", "A"): "jasminepaul",
}

# Subjects the workload allocates but that have no timetable slot.
EXTRA_SUBJECTS = [
    dict(code="23AD523", name="Summer Internship", credits=1.0, is_lab=True,
         hours=0, semester=5, study_year=3, faculty=["ramani"], sections=[("III", "A")]),
]

# The lab-sheet writes Computer Vision as 23AD503; the class timetable and workload say 23AD053.
CODE_FIX = {"23AD503": "23AD053"}

# The class timetable's course table has run-together or misspelt titles. Each replacement
# below is the spelling used by the lab sheet or the workload document for the same code.
NAME_FIX = {
    "Cloud Databaes": "Cloud Databases",                       # Lab sheet: "Cloud Databases"
    "ComputerVision": "Computer Vision",                       # Lab sheet: "Computer Vision"
    "KnowledgeManagement(Management Courses)": "Knowledge Management (Management Courses)",
    "ProjectWork- Phase2": "Project Work - Phase 2",           # workload: "Project Work - Phase 2"
    "Technical Seminar -2": "Technical Seminar - 2",           # workload: "Technical Seminar - 2"
}

# The placement "Communication Skill" slot carries no course code and no credits. It is
# printed under the PRACTICALS heading but is a placement session, not a laboratory, so it
# is stored as theory to keep it out of lab-only views. COMM-SKILL is a local placeholder
# code, not a university code.
COMM_SKILL = "COMM-SKILL"

warnings = []


def warn(message):
    warnings.append(message)
    print("  WARNING:", message)


# ------------------------------------------------------------------ spreadsheet
def merge_map(ws):
    m = {}
    for rng in ws.merged_cells.ranges:
        for r in range(rng.min_row, rng.max_row + 1):
            for c in range(rng.min_col, rng.max_col + 1):
                m[(r, c)] = (rng.min_row, rng.min_col)
    return m


def cell(ws, mm, r, c):
    ar, ac = mm.get((r, c), (r, c))
    v = ws.cell(ar, ac).value
    return "" if v is None else " ".join(str(v).split())


def norm_code(raw):
    return CODE_FIX.get(raw.replace(" ", "").upper(), raw.replace(" ", "").upper())


def faculty_key(raw):
    """Map one spelling to a roster key; returns None for blank."""
    canonical = re.sub(r"[^a-z]", "", raw.lower())
    if not canonical:
        return None
    if canonical in NAME_ALIASES:
        return NAME_ALIASES[canonical]
    raise SystemExit(f"unmapped faculty name: {raw!r} (canonical {canonical!r})")


def faculty_keys(raw):
    """A cell may name several faculty separated by '/'."""
    return [faculty_key(part) for part in raw.split("/") if part.strip()]


BATCH_RE = re.compile(
    r"^(?P<a>2\d[A-Z]{2}\d{3})\s*[-(]?\s*B\s*(?P<ab>I{1,2}|[12])\s*\)?\s*/\s*"
    r"(?P<b>2\d[A-Z]{2}\d{3})\s*[-(]?\s*B\s*(?P<bb>I{1,2}|[12])\s*\)?$", re.I)
CODE_RE = re.compile(r"^(2\d\s?[A-Z]{2,3}\d{3})", re.I)
SECTION_TAG_RE = re.compile(r"\(\s*II\s*-\s*([AB])\s*\)", re.I)
PROJECT_RE = re.compile(r"^project\s*work\s*(?P<who>.*)$", re.I)
BATCH_NORM = {"I": 1, "1": 1, "II": 2, "2": 2}


def parse_label(text):
    text = text.strip()
    if not text:
        return []
    m = BATCH_RE.match(text)
    if m:
        return [{"code": norm_code(m.group("a")), "batch": BATCH_NORM[m.group("ab").upper()]},
                {"code": norm_code(m.group("b")), "batch": BATCH_NORM[m.group("bb").upper()]}]
    m = PROJECT_RE.match(text)
    if m:
        who = m.group("who").strip()
        return [{"code": "23AD721", "batch": None, "faculty": faculty_key(who) if who else None}]
    if re.match(r"^communication\s*skill", text, re.I):
        return [{"code": COMM_SKILL, "batch": None}]
    m = CODE_RE.match(text)
    if m:
        entry = {"code": norm_code(m.group(1)), "batch": None}
        tag = SECTION_TAG_RE.search(text)
        if tag:
            entry["section_tag"] = tag.group(1).upper()
        return [entry]
    raise SystemExit(f"unparsed timetable label: {text!r}")


def read_grid(ws, spec):
    mm = merge_map(ws)
    out = {}
    for i in range(5):
        row = spec["row0"] + i
        day = DAYS.get(cell(ws, mm, row, 1).upper().strip())
        if day is None:
            raise SystemExit(f"bad day label at {ws.title} row {row}")
        out[day] = {}
        for (pnum, _, _), (c0, c1) in zip(PERIODS, spec["cols"]):
            for c in range(c0, c1 + 1):
                v = cell(ws, mm, row, c)
                if v:
                    out[day][pnum] = parse_label(v)
                    break
    return out


def read_courses(ws, sheet, r0, r1):
    mm = merge_map(ws)
    fac_col = 9 if sheet == "Lab" else 11
    hrs_col = 8 if sheet == "Lab" else 10
    rows = {}
    for r in range(r0, r1 + 1):
        name = cell(ws, mm, r, 3)
        if not name or name.upper() in {"THEORY", "PRACTICALS", "THEORY AND PRACTICALS"}:
            continue
        raw_code = cell(ws, mm, r, 1)
        code = norm_code(re.sub(r"\(.*", "", raw_code)) if raw_code else COMM_SKILL
        faculty_cell = cell(ws, mm, r, fac_col) or cell(ws, mm, r, fac_col + 1)
        credits = cell(ws, mm, r, 2).replace("*", "").strip()
        hours = cell(ws, mm, r, hrs_col)
        rows[code] = dict(
            code=code, name=name,
            credits=float(credits.split("+")[0]) if credits else 0.0,
            hours=int(float(hours)) if hours else 0,
            faculty=faculty_keys(faculty_cell),
            is_lab=None,  # filled by section header below
        )
    # Re-walk to tag which block (THEORY / PRACTICALS) each row sat under.
    block = None
    for r in range(r0, r1 + 1):
        header = cell(ws, mm, r, 1).upper()
        if header in {"THEORY", "PRACTICALS", "THEORY AND PRACTICALS"}:
            block = header
            continue
        name = cell(ws, mm, r, 3)
        if not name:
            continue
        raw_code = cell(ws, mm, r, 1)
        code = norm_code(re.sub(r"\(.*", "", raw_code)) if raw_code else COMM_SKILL
        if code in rows:
            rows[code]["is_lab"] = block == "PRACTICALS"
            rows[code]["block"] = block
    return rows


# ----------------------------------------------------------------------- build
def main():
    print("Reading timetable workbook...")
    wb = openpyxl.load_workbook(os.path.join(ROOT, "AI & DS - Timetable Final (1).xlsx"), data_only=True)
    grids = {s: read_grid(wb[s], spec) for s, spec in GRID.items()}
    courses = {s: read_courses(wb[s], s, *rows) for s, rows in COURSE_ROWS.items()}

    # ---- subjects, keyed by (semester number, code)
    subjects = {}
    for sheet, (roman, sec, semnum, study_year) in SHEET_SECTION.items():
        for code, c in courses[sheet].items():
            key = (semnum, code)
            if key in subjects:
                # II-A and II-B share semester 3; names and credits must agree.
                if subjects[key]["name"] != c["name"]:
                    warn(f"{code}: name differs between sections "
                         f"({subjects[key]['name']!r} vs {c['name']!r}); keeping the first")
                continue
            is_lab = bool(c["is_lab"]) and code != COMM_SKILL
            subjects[key] = dict(
                semester=semnum, code=code, name=NAME_FIX.get(c["name"], c["name"]),
                credits=c["credits"], is_lab=is_lab,
                weekly_hours=max(1, c["hours"]), study_year=study_year,
                subject_type="laboratory" if is_lab else "theory",
            )
    for extra in EXTRA_SUBJECTS:
        subjects[(extra["semester"], extra["code"])] = dict(
            semester=extra["semester"], code=extra["code"], name=extra["name"],
            credits=extra["credits"], is_lab=extra["is_lab"],
            weekly_hours=max(1, extra["hours"]), study_year=extra["study_year"],
            subject_type="laboratory" if extra["is_lab"] else "theory",
        )
    print(f"  subjects: {len(subjects)}")

    # ---- which class occupies the John McCarthy lab in each slot
    lab_slots = set()  # (roman, section, day, period)
    for day, slots in grids["Lab"].items():
        for period, entries in slots.items():
            codes = {e["code"] for e in entries}
            tag = next((e["section_tag"] for e in entries if e.get("section_tag")), None)
            matches = []
            for sheet, (roman, sec, _, _) in SHEET_SECTION.items():
                if tag and not (roman == "II" and sec == tag):
                    continue
                got = {e["code"] for e in grids[sheet].get(day, {}).get(period, [])}
                if got == codes:
                    matches.append((roman, sec))
            if len(matches) == 1:
                lab_slots.add((matches[0][0], matches[0][1], day, period))
            elif not matches:
                warn(f"lab sheet slot day {day} P{period} {sorted(codes)} matched no class timetable")
            else:
                warn(f"lab sheet slot day {day} P{period} {sorted(codes)} matched {matches}; skipped")
    print(f"  lab-occupied class slots: {len(lab_slots)}")

    # ---- timetable entries
    timetable = []
    for sheet, (roman, sec, semnum, _) in SHEET_SECTION.items():
        for day, slots in grids[sheet].items():
            for period, entries in slots.items():
                for entry in entries:
                    code = entry["code"]
                    course = courses[sheet].get(code)
                    if not course:
                        warn(f"{sheet} day {day} P{period}: {code} is not in that sheet's course table")
                        continue
                    who = entry.get("faculty") or (course["faculty"][0] if course["faculty"] else None)
                    if len(course["faculty"]) > 1 and not entry.get("faculty"):
                        note = (f"{sheet} {code} is shared by {len(course['faculty'])} faculty "
                                f"({', '.join(course['faculty'])}); all of them get a subject "
                                f"allocation, but the timetable slot names {who}")
                        if note not in warnings:
                            warn(note)
                    in_lab = (roman, sec, day, period) in lab_slots
                    start, end = next((s, e) for p, s, e in PERIODS if p == period)
                    timetable.append(dict(
                        year=roman, section=sec, semester=semnum, code=code,
                        day_of_week=day, period=period, starts_at=start, ends_at=end,
                        room=LAB_NAME + " LAB" if in_lab else f"AI&DS {roman}-{sec}",
                        lab=LAB_NAME if in_lab else None,
                        faculty=who, batch=entry.get("batch"),
                    ))
    print(f"  timetable entries: {len(timetable)}")

    # ---- faculty assignments
    assignments = {}
    for sheet, (roman, sec, semnum, _) in SHEET_SECTION.items():
        for code, c in courses[sheet].items():
            # The deployed database enforces one active `subject_faculty` per subject per
            # section (faculty_assignments_one_primary_subject_faculty). Where a theory
            # subject is co-taught, the first name listed becomes the primary and the rest
            # are recorded as lab_faculty so they still hold the subject for attendance and
            # marks. Lab subjects are all lab_faculty already and are unaffected.
            is_lab = subjects[(semnum, code)]["is_lab"]
            for index, key in enumerate(c["faculty"]):
                kind = "lab_faculty" if (is_lab or index > 0) else "subject_faculty"
                if index > 0 and not is_lab:
                    warn(f"{roman}-{sec} {code} is co-taught; {key} is recorded as co-faculty "
                         f"(lab_faculty) because only one primary subject faculty is allowed")
                assignments[(key, code, roman, sec, kind)] = dict(
                    faculty=key, code=code, year=roman, section=sec, semester=semnum,
                    assignment_type=kind, weekly_hours=max(1, c["hours"]))
    for extra in EXTRA_SUBJECTS:
        for key in extra["faculty"]:
            for roman, sec in extra["sections"]:
                kind = "lab_faculty" if extra["is_lab"] else "subject_faculty"
                assignments[(key, extra["code"], roman, sec, kind)] = dict(
                    faculty=key, code=extra["code"], year=roman, section=sec,
                    semester=extra["semester"], assignment_type=kind,
                    weekly_hours=max(1, extra["hours"]))
    for (roman, sec), key in CLASS_TEACHER.items():
        semnum = next(s for _, (r, x, s, _) in SHEET_SECTION.items() if (r, x) == (roman, sec))
        assignments[(key, None, roman, sec, "class_teacher")] = dict(
            faculty=key, code=None, year=roman, section=sec, semester=semnum,
            assignment_type="class_teacher", weekly_hours=0)
    print(f"  faculty assignments: {len(assignments)}")

    # ---- students
    print("Reading name list...")
    swb = openpyxl.load_workbook(os.path.join(ROOT, "Overall Name List (1).xlsx"), data_only=True)
    LIST_SECTION = {"II - A": ("II", "A"), "II - B": ("II", "B"), "III": ("III", "A"), "IV": ("IV", "A")}
    students, seen = [], {}
    for ws in swb.worksheets:
        roman, sec = LIST_SECTION[ws.title]
        for row in ws.iter_rows(values_only=True):
            if not row or len(row) < 3 or row[1] is None or row[2] is None:
                continue
            reg = str(row[1]).strip()
            if not re.fullmatch(r"\d{10}", reg):
                continue
            name = " ".join(str(row[2]).split())
            if reg in seen:
                warn(f"register number {reg} is used by both {seen[reg]!r} and {name!r}; "
                     f"{name!r} is loaded WITHOUT a register number and cannot sign in until it is corrected")
                students.append(dict(name=name, register_number=None, user_id=None,
                                     year=roman, section=sec, needs_register_number=True))
                continue
            seen[reg] = name
            students.append(dict(name=name, register_number=reg, user_id=reg,
                                 year=roman, section=sec, needs_register_number=False))
    print(f"  students: {len(students)}")

    # ---- floor duty
    print("Reading floor duty...")
    import docx
    fd = docx.Document(os.path.join(ROOT, "Floor Duty 2026-27.docx"))
    floor_duty, table = [], fd.tables[0]
    header = [c.text.strip() for c in table.rows[0].cells]
    for row in table.rows[1:]:
        cells = [c.text.strip() for c in row.cells]
        day = cells[1]
        for col in range(2, min(5, len(cells))):
            # The .docx uses a Windows-1252 en dash that reads back as U+2013 / mojibake.
            label = " ".join(header[col].split()).replace("–", "-").replace("—", "-")
            # "Morning Break (10.55 AM - 11.10 AM)" -> name plus a start and end time, so the
            # roster can be stored as data rather than as a sentence.
            name = re.sub(r"\s*\(.*", "", label).strip()
            times = re.findall(r"(\d{1,2})[.:](\d{2})\s*(AM|PM)", label, re.I)
            span = []
            for hour, minute, meridiem in times[:2]:
                hour = int(hour) % 12 + (12 if meridiem.upper() == "PM" else 0)
                span.append(f"{hour:02d}:{minute}")
            floor_duty.append(dict(
                day=day, day_of_week=DAYS[day[:3].upper()], shift=name, label=label,
                starts_at=span[0] if len(span) == 2 else None,
                ends_at=span[1] if len(span) == 2 else None,
                display_order=col - 1,
                faculty=faculty_key(cells[col]), faculty_raw=cells[col]))
    print(f"  floor duty assignments: {len(floor_duty)}")

    # ---- sanity checks
    used = {t["faculty"] for t in timetable if t["faculty"]}
    used |= {a["faculty"] for a in assignments.values()}
    roster = {k for k, *_ in FACULTY}
    for key in sorted(used - roster):
        warn(f"faculty key {key!r} is used but not on the roster")
    for key in sorted(roster - used):
        warn(f"faculty {key!r} is on the roster but teaches nothing")

    per_section = Counter((t["year"], t["section"]) for t in timetable)
    for (roman, sec), n in sorted(per_section.items()):
        slots = len({(t["day_of_week"], t["period"]) for t in timetable
                     if t["year"] == roman and t["section"] == sec})
        print(f"  {roman}-{sec}: {n} entries across {slots}/35 slots")
        if slots != 35:
            warn(f"{roman}-{sec} has {slots} occupied slots, expected 35")

    data = dict(
        meta=dict(department_code=DEPARTMENT_CODE, academic_year=ACADEMIC_YEAR,
                  email_domain=EMAIL_DOMAIN, semester_starts=SEM_STARTS, semester_ends=SEM_ENDS,
                  generated_at=__import__("datetime").datetime.now().isoformat(timespec="seconds")),
        periods=[dict(period=p, starts_at=s, ends_at=e) for p, s, e in PERIODS],
        breaks=[dict(label=l, starts_at=s, ends_at=e, period_type=t) for l, s, e, t in BREAKS],
        semesters=sorted({s for s, _ in subjects}),
        sections=[dict(year=r, section=x, semester=s, study_year=y)
                  for _, (r, x, s, y) in SHEET_SECTION.items()],
        # Passwords are deliberately not stored here: a staff password is derived from the
        # user id (`<name>_aids` -> `<name>@aids`) and a student's is the last four digits
        # of their register number. Keeping them out means this file holds no secret.
        faculty=[dict(key=k, name=n, user_id=u, designation=d, role=role,
                      is_department=k in DEPARTMENT_KEYS)
                 for k, n, u, d, role in FACULTY],
        subjects=sorted(subjects.values(), key=lambda s: (s["semester"], s["code"])),
        students=students,
        assignments=sorted(assignments.values(),
                           key=lambda a: (a["year"], a["section"], a["assignment_type"], a["code"] or "")),
        timetable=sorted(timetable, key=lambda t: (t["year"], t["section"], t["day_of_week"], t["period"])),
        floor_duty=floor_duty,
        warnings=warnings,
    )
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=1, ensure_ascii=False)
    print(f"\nWrote {OUT}")
    print(f"Warnings: {len(warnings)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
