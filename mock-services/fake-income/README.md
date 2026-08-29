# Fake Income System

Simulated external government system for the SetuX SIH prototype.

## What this represents

A revenue/income certificate system: returning declared income band data used for means-tested scholarship eligibility.

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
   Fake Income System connector
       ↓
   Fake Income System (simulated)
```
