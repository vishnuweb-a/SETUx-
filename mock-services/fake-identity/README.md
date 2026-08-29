# Fake Identity System

Simulated external government system for the SetuX SIH prototype.

## What this represents

A government identity registry standing in for a national identity provider: confirming that a citizen's identity attributes match an authoritative record.

## Status

**Not implemented.** This directory is an architectural boundary created in
Phase 0. The service is implemented in **Phase 9 — Fake Government Connectors**.

## Important

This is a **simulation**. It is not connected to any real government system and
contains no real citizen data. All datasets used here must be synthetic.

SetuX business modules must never depend on this service directly — they depend
on a connector interface, which this service sits behind:

```text
Application Service
       ↓
   Provider interface
       ↓
   Fake Identity System connector
       ↓
   Fake Identity System (simulated)
```
