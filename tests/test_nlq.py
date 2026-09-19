"""Natural-language query parser — bounded parsing with an explicit ignored list.

The governing rule under test: a constraint the parser cannot apply must appear in
`ignored`, never be dropped silently. The regression that motivated this module is
`test_flagship_query_reports_every_dropped_constraint`.
"""
import json

import pytest

from backend.config import PROJECT_ROOT
from backend.nlq import parse, execute, summarise, to_cypher

FLAGSHIP = ("Show me all associates of Suspect A1 who made transactions "
            "over 5 lakh in North Delhi during July")


@pytest.fixture(scope="module")
def graph():
    path = PROJECT_ROOT / "output" / "graph.json"
    if not path.exists():
        pytest.skip("graph not built — run backend.graph.builder")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _ignored_phrases(intent):
    return [i["phrase"].lower() for i in intent.ignored]


# ── the regression this module exists for ──────────────────────────────────

def test_flagship_query_reports_every_dropped_constraint(graph):
    intent = parse(FLAGSHIP, graph)

    # Applied, and stated
    assert intent.subjects == ["A1"]
    assert intent.relation == "TRANSACTED"
    assert intent.amount_op == ">" and intent.amount_value == 500_000
    assert any("500,000" in u for u in intent.understood)

    # Not applied — and said so, with a reason
    phrases = _ignored_phrases(intent)
    assert "july" in phrases, "calendar month silently dropped"
    assert "north delhi" in phrases, "unknown location silently dropped"
    for entry in intent.ignored:
        assert entry["reason"].strip(), "every ignored term needs a reason"

    # The location and date were never applied as filters
    assert intent.location is None
    assert intent.day_from is None


def test_flagship_query_answer_is_honest_zero(graph):
    # A1's neighbourhood genuinely holds no transaction over 5 lakh, so the
    # correct answer is an empty set — not a network-wide result list.
    rows = execute(parse(FLAGSHIP, graph), graph)
    assert rows == []


# ── subject scope: the records must actually involve the person named ──────

def test_named_person_returns_only_their_own_records(graph):
    # "meena joshi call records" previously expanded to her neighbourhood and
    # returned calls between her contacts that she was never party to.
    intent = parse("meena joshi call records", graph)
    assert intent.hops == 0, "a named subject must not widen to the neighbourhood"
    rows = execute(intent, graph)
    assert rows
    subject = intent.subjects[0]
    offenders = [r for r in rows if subject not in (r["src"], r["dst"])]
    assert not offenders, f"{len(offenders)} rows do not involve {subject}"


def test_associates_phrasing_opts_into_one_hop(graph):
    assert parse("associates of A1", graph).hops == 1
    assert parse("who is connected to A1", graph).hops == 1
    assert parse("calls from A1", graph).hops == 0


# ── the stated answer ──────────────────────────────────────────────────────

def test_summary_names_the_subject_and_volume(graph):
    intent = parse("meena joshi call records", graph)
    text = summarise(intent, execute(intent, graph), graph)
    assert "Meena Joshi" in text and "A11" in text
    assert "call records" in text


def test_summary_of_money_reports_total_and_largest(graph):
    intent = parse("transactions over 2 lakh", graph)
    text = summarise(intent, execute(intent, graph), graph)
    assert "Total ₹" in text and "largest ₹" in text


def test_summary_is_honest_when_empty(graph):
    intent = parse(FLAGSHIP, graph)
    assert "No records match" in summarise(intent, execute(intent, graph), graph)


# ── individual dimensions ──────────────────────────────────────────────────

def test_subject_by_id(graph):
    assert parse("calls from A1", graph).subjects == ["A1"]


def test_subject_by_name(graph):
    assert parse("who did Anwar Sheikh call", graph).subjects == ["A1"]


def test_subject_by_hindi_name_uses_existing_resolver(graph):
    # name_similarity transliterates Devanagari, so Hindi names resolve for free.
    assert parse("रमेश यादव के कॉल", graph).subjects, "Hindi name did not resolve"


@pytest.mark.parametrize("q,expected", [
    ("transactions over 2 lakh", "TRANSACTED"),
    ("payments by C12", "TRANSACTED"),
    ("calls from A1", "CALLED"),
    ("who called A2", "CALLED"),
    ("meetings near the docks", "MET"),
])
def test_relation_keywords_including_plurals(q, expected, graph):
    assert parse(q, graph).relation == expected


@pytest.mark.parametrize("q,op,value", [
    ("transactions over 5 lakh", ">", 500_000),
    ("transactions above 2 crore", ">", 20_000_000),
    ("payments under 50000 by C12", "<", 50_000),
    ("transfers over rs 75,000", ">", 75_000),
])
def test_amount_parsing(q, op, value, graph):
    intent = parse(q, graph)
    assert (intent.amount_op, intent.amount_value) == (op, float(value))


def test_entity_id_digit_is_not_read_as_an_amount(graph):
    # "A1" contains a 1 — it must not become an amount filter, and must not
    # stop the real amount later in the sentence from being found.
    intent = parse("transactions by A1 over 3 lakh", graph)
    assert intent.subjects == ["A1"]
    assert intent.amount_value == 300_000


@pytest.mark.parametrize("q,lo,hi", [
    ("calls on day 61", 61, 61),
    ("calls between day 55 and 62", 55, 62),
    ("activity in week 9", 57, 63),
])
def test_day_ranges(q, lo, hi, graph):
    intent = parse(q, graph)
    assert (intent.day_from, intent.day_to) == (lo, hi)


def test_day_number_is_not_an_amount(graph):
    assert parse("calls on day 61", graph).amount_value is None


def test_known_location_is_applied(graph):
    intent = parse("calls at Dockside Ward", graph)
    assert intent.location == "Dockside Ward"
    assert not _ignored_phrases(intent)


# ── honest failure ─────────────────────────────────────────────────────────

def test_gibberish_returns_nothing_rather_than_the_whole_graph(graph):
    intent = parse("blabla unknown gibberish", graph)
    assert not intent.has_filter
    assert execute(intent, graph) == []
    assert intent.ignored


def test_calendar_year_is_reported_as_unsupported(graph):
    assert "2026" in _ignored_phrases(parse("transactions in 2026", graph))


# ── execution + rendering ──────────────────────────────────────────────────

def test_amount_filter_coerces_string_amounts(graph):
    rows = execute(parse("transactions over 2 lakh", graph), graph)
    assert rows, "expected matches above 2 lakh"
    assert all(r["amount"] > 200_000 for r in rows)


def test_day_filter_scopes_results(graph):
    rows = execute(parse("calls between day 55 and 62", graph), graph)
    assert rows
    assert all(55 <= r["day"] <= 62 for r in rows)


def test_rows_carry_provenance(graph):
    rows = execute(parse("transactions over 2 lakh", graph), graph)
    assert all("evidence_hash" in r and "source" in r for r in rows)


def test_cypher_is_parameterised(graph):
    rendered = to_cypher(parse("transactions by A1 over 3 lakh", graph))
    assert "$amt" in rendered["cypher"] and "$ids" in rendered["cypher"]
    assert rendered["params"]["amt"] == 300_000
    assert rendered["params"]["ids"] == ["A1"]
    assert "300000" not in rendered["cypher"], "values must not be inlined into the query"
