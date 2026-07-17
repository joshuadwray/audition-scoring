"""Command-line interface.

  python -m tracker check [--dry-run] [--no-notify] [--source ID]
  python -m tracker add book "title" [--yes]
  python -m tracker add movie "title" [--year 2026] [--yes]
  python -m tracker probe [--source ID] [--query "..."]
  python -m tracker list
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import notify
from .config import Config, load_config
from .models import Observation
from .report import build_report
from .sources import build_sources
from .state import State


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tracker",
                                     description="Watchlist watcher for library "
                                                 "books and movie showtimes")
    parser.add_argument("--watchlist", help="path to watchlist.yaml")
    sub = parser.add_subparsers(dest="command", required=True)

    p_check = sub.add_parser("check", help="run all sources, notify on new sightings")
    p_check.add_argument("--source", help="only run this source id")
    p_check.add_argument("--dry-run", action="store_true",
                         help="print report; don't save state, write files, or push")
    p_check.add_argument("--no-notify", action="store_true",
                         help="update state and report but skip the phone push")

    p_add = sub.add_parser("add", help="add a watchlist entry, verified against "
                                       "live catalog records")
    p_add.add_argument("kind", choices=["book", "movie"])
    p_add.add_argument("title")
    p_add.add_argument("--author")
    p_add.add_argument("--year", type=int)
    p_add.add_argument("--isbn")
    p_add.add_argument("--yes", action="store_true",
                       help="skip the interactive pick; add exactly as typed")

    p_probe = sub.add_parser("probe", help="dump raw source responses for "
                                           "endpoint/selector debugging")
    p_probe.add_argument("--source", help="only probe this source id")
    p_probe.add_argument("--query", help="override the probe search query")

    sub.add_parser("list", help="show the parsed watchlist")

    args = parser.parse_args(argv)
    config = load_config(args.watchlist)

    if args.command == "check":
        return cmd_check(config, args)
    if args.command == "add":
        return cmd_add(config, args)
    if args.command == "probe":
        return cmd_probe(config, args)
    if args.command == "list":
        return cmd_list(config)
    return 2


def _select_sources(config: Config, source_id: str | None):
    sources = build_sources(config)
    if source_id:
        sources = [s for s in sources if s.source_id == source_id]
        if not sources:
            sys.exit(f"no enabled source with id '{source_id}'")
    return sources


def cmd_check(config: Config, args: argparse.Namespace) -> int:
    sources = _select_sources(config, args.source)
    state = State(config.state_path)

    results = [s.run(config) for s in sources]
    new: list[Observation] = []
    for r in results:
        for obs in r.observations:
            if state.is_new(obs):
                new.append(obs)
                state.record(obs)
    state.prune()

    report = build_report(config, results, new, state)
    if args.dry_run:
        print(report)
        print("(dry run: state not saved, no files written, no push sent)")
        return 0

    report_path = config.state_path.parent / "report.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report)
    state.save()

    print(report)
    if new and not args.no_notify:
        if notify.push_configured():
            try:
                notify.send_push(new)
                print(f"pushed {len(new)} notification(s) via ntfy")
            except Exception as exc:  # noqa: BLE001 — a failed push shouldn't fail the run
                print(f"WARNING: ntfy push failed: {exc}", file=sys.stderr)
        else:
            print("NTFY_TOPIC not set — new sightings recorded but not pushed",
                  file=sys.stderr)

    # Partial source failures are normal (sites flake); only a run where
    # every source errored is a failed run.
    failures = [r for r in results if r.error]
    return 1 if failures and len(failures) == len(results) else 0


def cmd_add(config: Config, args: argparse.Namespace) -> int:
    if args.kind == "book":
        entry = _pick_book(config, args)
        section = "books"
    else:
        entry = {"title": args.title}
        if args.year:
            entry["year"] = args.year
        section = "movies"

    watchlist_path = Path(args.watchlist) if args.watchlist else \
        Path(__file__).resolve().parent.parent / "watchlist.yaml"
    _append_entry(watchlist_path, section, entry)
    print(f"added to {section}: {entry}")
    return 0


def _pick_book(config: Config, args: argparse.Namespace) -> dict:
    as_typed = {"title": args.title}
    if args.author:
        as_typed["author"] = args.author
    if args.isbn:
        as_typed["isbn"] = args.isbn

    interactive = sys.stdin.isatty() and not args.yes
    if not interactive:
        return as_typed

    candidates: list[dict] = []
    for source in build_sources(config):
        search = getattr(source, "search_books", None)
        if not search:
            continue
        print(f"searching {source.source_id} ...")
        try:
            candidates.extend(c for c in search(args.title) if c.get("title"))
        except Exception as exc:  # noqa: BLE001
            print(f"  ({source.source_id} search failed: {exc})")

    if not candidates:
        print("no live catalog records found; adding as typed "
              "(fuzzy matching will apply)")
        return as_typed

    seen: set[tuple] = set()
    unique = []
    for c in candidates:
        key = (c.get("title"), c.get("author"), c.get("format"))
        if key not in seen:
            seen.add(key)
            unique.append(c)
    unique = unique[:10]

    print("\nPick the record you mean (canonical IDs make matching exact):")
    print("  0. none of these — add exactly as typed")
    for i, c in enumerate(unique, 1):
        bits = [c.get("title") or "?"]
        if c.get("author"):
            bits.append(str(c["author"]))
        if c.get("format"):
            bits.append(str(c["format"]))
        bits.append(f"[{c['source']}]")
        print(f"  {i}. " + " — ".join(bits))

    while True:
        raw = input("choice: ").strip()
        if raw.isdigit() and 0 <= int(raw) <= len(unique):
            break
        print(f"enter a number 0-{len(unique)}")
    choice = int(raw)
    if choice == 0:
        return as_typed

    picked = unique[choice - 1]
    entry = {"title": picked["title"]}
    if picked.get("author"):
        entry["author"] = picked["author"]
    if args.isbn or picked.get("isbn"):
        entry["isbn"] = args.isbn or picked["isbn"]
    if picked.get("bib_id"):
        entry["bib_id"] = picked["bib_id"]
    return entry


def _append_entry(path: Path, section: str, entry: dict) -> None:
    """Insert an entry under `books:`/`movies:` without disturbing the rest
    of a hand-commented YAML file. Falls back to printing the snippet."""
    snippet = [f"  - title: {_yaml_str(entry['title'])}"]
    for k, v in entry.items():
        if k != "title":
            snippet.append(f"    {k}: {_yaml_str(v)}")

    lines = path.read_text().splitlines()
    for i, line in enumerate(lines):
        if line.strip() == f"{section}:" or line.strip() == f"{section}: []":
            lines[i] = f"{section}:"
            lines[i + 1:i + 1] = snippet
            path.write_text("\n".join(lines) + "\n")
            return
    print(f"couldn't find a '{section}:' section in {path}; add manually:")
    print(f"{section}:")
    print("\n".join(snippet))


def _yaml_str(v: object) -> str:
    if isinstance(v, int):
        return str(v)
    s = str(v)
    if any(ch in s for ch in ":#'\"{}[]") or s != s.strip():
        return '"' + s.replace('"', '\\"') + '"'
    return s


def cmd_probe(config: Config, args: argparse.Namespace) -> int:
    for source in _select_sources(config, args.source):
        print(f"\n===== {source.source_id} ({source.kind}) =====")
        try:
            print(source.probe(config, args.query))
        except Exception as exc:  # noqa: BLE001
            print(f"probe failed: {type(exc).__name__}: {exc}")
    return 0


def cmd_list(config: Config) -> int:
    print(f"books ({len(config.books)}):")
    for b in config.books:
        ids = " ".join(filter(None, [
            f"isbn={b.isbn}" if b.isbn else None,
            f"bib_id={b.bib_id}" if b.bib_id else None,
        ]))
        print(f"  - {b}" + (f"  [{ids}]" if ids else ""))
    print(f"movies ({len(config.movies)}):")
    for m in config.movies:
        print(f"  - {m}")
    print(f"sources ({len(config.enabled_sources())} enabled):")
    for sid, cfg in config.sources.items():
        flag = "on " if cfg.get("enabled", True) else "off"
        print(f"  - [{flag}] {sid} ({cfg.get('kind')})")
    return 0
