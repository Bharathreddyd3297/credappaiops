"""Normalization helpers.

Every client (Prometheus, Kubernetes, Azure Monitor, Log Analytics)
returns data in its own native shape. These helpers convert each into
one consistent, LLM-friendly structure - a list of plain dicts with a
"source", "label", and "value" - so the Prompt Builder never needs to
know which system a given fact came from.
"""

from __future__ import annotations

from typing import Any


def normalize_prometheus_result(
    raw: dict[str, Any], query: str, metric_name: str | None = None
) -> list[dict[str, Any]]:
    """Flattens a Prometheus /api/v1/query response into normalized facts.

    Prometheus's own `__name__` label is dropped by the `by (...)` clauses
    most of our queries use, and the raw PromQL string is meaningless to
    the LLM - so without a human-readable `metric_name`, two different
    queries (e.g. node CPU % vs node memory %) can render as
    indistinguishable "instance=X = <number>" lines. Callers that already
    know what they asked for (see app/services/telemetry_collector.py)
    should always pass one; it's optional only for the raw ad-hoc PromQL
    passthrough at GET /api/ai/prometheus, where no fixed label exists.
    """
    facts: list[dict[str, Any]] = []
    data = raw.get("data", {})
    result_type = data.get("resultType", "")
    for item in data.get("result", []):
        metric_labels = item.get("metric", {})
        label_suffix = ", ".join(f"{k}={v}" for k, v in metric_labels.items() if k != "__name__")
        if metric_name:
            label = f"{metric_name} ({label_suffix})" if label_suffix else metric_name
        else:
            label = label_suffix or query

        if result_type == "vector":
            value = item.get("value", [None, None])[1]
        elif result_type == "matrix":
            samples = item.get("values", [])
            value = samples[-1][1] if samples else None
        else:
            value = None

        facts.append(
            {
                "source": "prometheus",
                "query": query,
                "label": label,
                "value": value,
            }
        )
    return facts


def normalize_pod_list(pods: list[dict[str, Any]]) -> list[dict[str, Any]]:
    facts: list[dict[str, Any]] = []
    for pod in pods:
        facts.append(
            {
                "source": "kubernetes",
                "type": "pod",
                "label": f"{pod['namespace']}/{pod['name']}",
                "value": pod["phase"],
                "restarts": pod.get("restarts", 0),
                "ready": pod.get("ready", False),
            }
        )
    return facts


def normalize_deployment_list(deployments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    facts: list[dict[str, Any]] = []
    for dep in deployments:
        facts.append(
            {
                "source": "kubernetes",
                "type": "deployment",
                "label": f"{dep['namespace']}/{dep['name']}",
                "value": f"{dep['available_replicas']}/{dep['desired_replicas']} available",
                "ready": dep.get("ready", False),
            }
        )
    return facts


def normalize_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    facts: list[dict[str, Any]] = []
    for event in events:
        facts.append(
            {
                "source": "kubernetes_events",
                "label": f"{event.get('reason', 'Event')} on {event.get('involved_object', 'unknown')}",
                "value": event.get("message", ""),
                "timestamp": event.get("last_timestamp"),
            }
        )
    return facts


def normalize_log_analytics_rows(rows: list[dict[str, Any]], table: str) -> list[dict[str, Any]]:
    facts: list[dict[str, Any]] = []
    for row in rows:
        facts.append(
            {
                "source": f"log_analytics:{table}",
                "label": table,
                "value": row,
            }
        )
    return facts


def facts_to_prompt_lines(facts: list[dict[str, Any]]) -> list[str]:
    """Renders normalized facts as compact, human-readable lines - the
    exact text embedded into the LLM prompt (see prompt_builder)."""
    lines: list[str] = []
    for fact in facts:
        source = fact.get("source", "unknown")
        label = fact.get("label", "")
        value = fact.get("value", "")
        lines.append(f"[{source}] {label} = {value}")
    return lines
