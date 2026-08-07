# Security policy

The benchmark is candidate-agnostic and must not execute candidate code in
pull-request CI. PR checks validate only the benchmark contract, verifier,
metric, schema, and repository security policy. Candidate execution and future
sealed runs belong in an explicitly isolated evaluation lane.

Dataset, metric, verifier, validity, schema, workflow, dependency, and
provenance changes are protected paths. They require the repository owner and
the protected CI lane even when the author is an agent.

Report suspected vulnerabilities privately to the repository owner. Do not
include credentials or sealed judgment data in issues or pull requests.
