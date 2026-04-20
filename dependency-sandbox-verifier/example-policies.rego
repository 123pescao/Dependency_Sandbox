# Example OPA Policies for DSV

package dsv

default allow = false

# Allow if no critical vulnerabilities
allow {
  not input.findings[_].severity == "CRITICAL"
}

# Warn if high severity
warn {
  input.findings[_].severity == "HIGH"
}

# Require review for new packages
needs_review {
  input.dependency_changes[_].change_type == "ADDED"
}

# Block if missing provenance
allow = false {
  input.attestations[_].verified == false
}