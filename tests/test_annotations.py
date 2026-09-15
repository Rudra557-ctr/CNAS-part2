"""Annotation store — validation, scoping, author-gated delete. tmp_path only."""
import pytest

from backend.annotations import (
    add_comment, delete_comment, comments_for, load_comments,
)


def test_add_and_filter(tmp_path):
    add_comment(tmp_path, "node", "B1", "Watch this one", "ann")
    add_comment(tmp_path, "case", "case", "Case-level note", "bob")
    assert len(load_comments(tmp_path)) == 2
    assert len(comments_for(tmp_path, "node", "B1")) == 1
    assert len(comments_for(tmp_path, "case")) == 1
    assert comments_for(tmp_path, "node", "NOPE") == []


def test_validation(tmp_path):
    with pytest.raises(ValueError):
        add_comment(tmp_path, "edge", "B1", "bad target", "ann")
    with pytest.raises(ValueError):
        add_comment(tmp_path, "node", "B1", "   ", "ann")
    with pytest.raises(ValueError):
        add_comment(tmp_path, "node", "B1", "x" * 2001, "ann")


def test_delete_author_or_supervisor(tmp_path):
    rec = add_comment(tmp_path, "node", "B1", "hi", "ann")
    with pytest.raises(PermissionError):
        delete_comment(tmp_path, rec["id"], "mallory", "investigator")
    assert delete_comment(tmp_path, rec["id"], "boss", "supervisor") is True
    assert delete_comment(tmp_path, "missing", "boss", "supervisor") is False
    rec2 = add_comment(tmp_path, "node", "B1", "hi again", "ann")
    assert delete_comment(tmp_path, rec2["id"], "ann", "analyst") is True
