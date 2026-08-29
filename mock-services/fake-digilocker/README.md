# Fake DigiLocker

Simulated external government system for the SetuX SIH prototype.

## What this represents

A document repository standing in for DigiLocker: issuing and returning citizen document metadata and contents on consent.

## Status

**Not implemented.** This directory is an architectural boundary created in
Phase 0. The service is implemented in **Phase 8 — Fake DigiLocker Integration**.

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
   Fake DigiLocker connector
       ↓
   Fake DigiLocker (simulated)
```
