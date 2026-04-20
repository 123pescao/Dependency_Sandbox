package dsv.policy

import rego.v1

# ---------------------------------------------------------------------------
# Boolean helpers — each becomes true when the named condition holds
# ---------------------------------------------------------------------------

_has_critical if {
	some f in input.findings
	f.severity == "CRITICAL"
}

_has_sandbox_suspicious if {
	some f in input.findings
	f.type == "SANDBOX_SUSPICIOUS"
}

_has_high if {
	some f in input.findings
	f.severity == "HIGH"
}

_has_provenance_missing if {
	some f in input.findings
	f.type == "PROVENANCE_MISSING"
}

_has_lifecycle_script if {
	some f in input.findings
	f.type == "POLICY_VIOLATION"
	contains(f.title, "lifecycle")
}

_has_medium if {
	some f in input.findings
	f.severity == "MEDIUM"
}

# ---------------------------------------------------------------------------
# Priority chain: FAIL > NEEDS_REVIEW > WARN > PASS
# Mutual exclusivity is guaranteed by the "not" guards on lower-priority rules.
# Two rules can produce the same value without conflict (OPA merges them).
# ---------------------------------------------------------------------------

default result := "PASS"

result := "FAIL" if _has_critical

result := "FAIL" if _has_sandbox_suspicious

result := "NEEDS_REVIEW" if {
	not _has_critical
	not _has_sandbox_suspicious
	_has_high
}

result := "NEEDS_REVIEW" if {
	not _has_critical
	not _has_sandbox_suspicious
	_has_provenance_missing
}

result := "NEEDS_REVIEW" if {
	not _has_critical
	not _has_sandbox_suspicious
	_has_lifecycle_script
}

result := "WARN" if {
	not _has_critical
	not _has_sandbox_suspicious
	not _has_high
	not _has_provenance_missing
	not _has_lifecycle_script
	_has_medium
}

# ---------------------------------------------------------------------------
# Details — severity counts returned alongside the result
# ---------------------------------------------------------------------------

details := {
	"result":         result,
	"critical_count": count([f | some f in input.findings; f.severity == "CRITICAL"]),
	"high_count":     count([f | some f in input.findings; f.severity == "HIGH"]),
	"medium_count":   count([f | some f in input.findings; f.severity == "MEDIUM"]),
	"low_count":      count([f | some f in input.findings; f.severity == "LOW"]),
	"total_findings": count(input.findings),
}
