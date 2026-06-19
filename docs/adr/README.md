# Architecture Decision Records

Architecture Decision Records (ADRs) document significant architectural choices, the context that led to them, and their consequences. They provide a durable history that helps contributors understand why the project is designed as it is.

Add a new ADR when a decision has a meaningful, long-term effect on the system's architecture, security, data ownership, interfaces, or operational model. Small implementation details that can be changed without broader impact do not need an ADR.

ADR files use the naming convention `NNNN-short-descriptive-title.md`, with a four-digit sequence number followed by a concise kebab-case title. Once assigned, a number should not be reused, even if an ADR is later superseded.

Each ADR should include its title, status, context, decision, consequences, and notes or future updates. Future Codex work and contributor changes must respect accepted ADRs. If new work conflicts with an accepted ADR, propose a new ADR that explicitly supersedes or amends it before implementing the conflicting change.
