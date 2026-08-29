SetuX — Authentication API Specification

Version: 1.0
Project: SetuX SIH MVP
Module: Authentication
Backend: Supabase Auth + PostgreSQL
Architecture: Modular Monolith
API Version: /api/v1

1. Purpose

This document defines the authentication API contract for the SetuX SIH MVP.

Authentication is responsible only for:

Account creation

Email verification

Login

Session management

Logout

Password recovery

Authenticated-user identification

Role resolution

Access control entry point

Onboarding is intentionally excluded from this document.

The separation is:

Authentication
      ↓
Who are you?
      ↓
Authenticated Session
      ↓
What role do you have?
      ↓
Authorized SetuX application access

2. Authentication UI

The SetuX authentication screen supports two application roles:

┌────────────────────────────────────────────┐
│                  SetuX                      │
│                                            │
│       Sign in to your account              │
│                                            │
│  [ Citizen ] [ Government Organization ]   │
│                                            │
│  Email or Mobile Number                    │
│  Password                                  │
│                                            │
│  ☑ Remember me       Forgot password?      │
│                                            │
│  [ Sign In as Citizen → ]                  │
│                                            │
│  Or continue with                          │
│       [ Google ] [ Other Provider ]         │
│                                            │
│  New to SetuX? Create an account           │
└────────────────────────────────────────────┘

The role selector changes the UI context, but it is not the final authorization mechanism.

The backend must determine the actual role from the authenticated SetuX profile.

3. Supported Roles

For the SIH MVP:

CITIZEN
GOVERNMENT_OFFICER

Role representation:

{
  "role": "CITIZEN"
}

or:

{
  "role": "GOVERNMENT_OFFICER"
}

4. Authentication Architecture

                    SETUX FRONTEND
                           │
                           │
                    Credentials
                           │
                           ▼
                  ┌─────────────────┐
                  │  Supabase Auth  │
                  └────────┬────────┘
                           │
                    Session + JWT
                           │
                           ▼
                  ┌─────────────────┐
                  │   SetuX API     │
                  │    /api/v1      │
                  └────────┬────────┘
                           │
                      Verify JWT
                           │
                           ▼
                    Authenticated User
                           │
                           ▼
                       profiles
                           │
                    ┌──────┴──────┐
                    │             │
                 CITIZEN     GOVERNMENT
                              OFFICER

5. Responsibility Separation

Supabase Auth

Responsible for:

Email
Password
Email verification
Authentication
Session
JWT
Password recovery
OAuth providers

SetuX

Responsible for:

Application role
Application profile
Authorization
Access permissions
Audit events

6. Authentication vs Authorization

Authentication

Answers:

Who is this user?

Credentials
     ↓
Supabase Auth
     ↓
Authenticated user ID

Authorization

Answers:

What can this authenticated user access?

Authenticated user ID
        ↓
SetuX profile
        ↓
Role
        ↓
Permissions

Therefore:

Authentication ≠ Authorization

7. Data Model Relationship

Supabase owns:

auth.users

SetuX owns:

profiles

Relationship:

auth.users.id
       │
       │ 1 : 1
       ▼
profiles.id

Example:

auth.users
┌──────────────────────────┐
│ id                       │
│ email                    │
│ encrypted credentials    │
│ email_confirmed_at       │
└────────────┬─────────────┘
             │
             ▼
profiles
┌──────────────────────────┐
│ id                       │
│ role                     │
│ status                   │
│ created_at               │
│ updated_at               │
└──────────────────────────┘

Passwords must never be stored in the SetuX profiles table.

8. Base API URL

Development:

http://localhost:3000/api/v1

Production:

https://<setux-domain>/api/v1

Authentication routes:

/api/v1/auth/*

9. Authentication Flow

User
  │
  ▼
Authentication Screen
  │
  ├── Sign Up
  │
  └── Sign In
        │
        ▼
   Supabase Auth
        │
        ├── Failure → Authentication Error
        │
        ▼
    Session + JWT
        │
        ▼
   GET /auth/me
        │
        ▼
   Resolve SetuX Role
        │
        ▼
  Authorized Application

10. Sign-Up

Endpoint

POST /api/v1/auth/signup

The endpoint acts as the SetuX application-level registration contract.

The actual credential creation can be delegated to Supabase Auth.

Request

{
  "email": "citizen@example.com",
  "password": "StrongPassword123!",
  "role": "CITIZEN"
}

Government account:

{
  "email": "officer@example.gov.in",
  "password": "StrongPassword123!",
  "role": "GOVERNMENT_OFFICER"
}

Validation

email
  → valid email format

password
  → required
  → minimum security requirements

role
  → CITIZEN
  → GOVERNMENT_OFFICER

11. Important Role Security Rule

The role sent by the client must not automatically grant privileged government access.

For example, this request:

{
  "email": "attacker@example.com",
  "password": "password",
  "role": "GOVERNMENT_OFFICER"
}

must not be enough to obtain government permissions.

Government access should be provisioned/approved through the controlled SetuX government-account process used by the MVP.

The authoritative role is:

profiles.role

12. Sign-Up Response

Success

201 Created

{
  "success": true,
  "message": "Account created. Please verify your email.",
  "data": {
    "user_id": "uuid",
    "email": "citizen@example.com",
    "role": "CITIZEN"
  }
}

13. Email Verification

Email verification is handled by Supabase Auth.

Flow:

Account Created
      ↓
Verification Email
      ↓
User Opens Verification Link
      ↓
Supabase Auth
      ↓
Email Verified
      ↓
User Can Sign In

SetuX should not create a separate password/email verification system.

14. Sign-In

For the MVP, credentials are authenticated through Supabase Auth.

Conceptual frontend operation:

supabase.auth.signInWithPassword()

Request:

email
password

Successful authentication returns a Supabase session containing the access token.

Credentials
     ↓
Supabase Auth
     ↓
Access Token
     ↓
SetuX API

15. Authenticated API Request

Protected SetuX APIs require:

Authorization: Bearer <access_token>

Example:

GET /api/v1/auth/me
Authorization: Bearer eyJ...

The backend extracts and validates the token before executing protected operations.

16. GET /api/v1/auth/me

Returns the currently authenticated SetuX user.

Request

GET /api/v1/auth/me

Header

Authorization: Bearer <access_token>

Response

{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "citizen@example.com"
    },
    "profile": {
      "role": "CITIZEN",
      "status": "ACTIVE"
    }
  }
}

Government officer:

{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "officer@example.gov.in"
    },
    "profile": {
      "role": "GOVERNMENT_OFFICER",
      "status": "ACTIVE"
    }
  }
}

17. Role Resolution

The role resolution flow is:

JWT
 │
 ▼
Authenticated User ID
 │
 ▼
profiles.id
 │
 ▼
profiles.role
 │
 ├── CITIZEN
 │
 └── GOVERNMENT_OFFICER

The frontend role selector is only a UX element.

It must not be used as the security source.

18. Authentication Middleware

Protected APIs should pass through authentication middleware.

Conceptual flow:

Request
  │
  ▼
Read Authorization Header
  │
  ▼
Extract Bearer Token
  │
  ▼
Validate Supabase JWT
  │
  ├── Invalid → 401
  │
  ▼
Extract User ID
  │
  ▼
Load SetuX Profile
  │
  ▼
Attach Auth Context
  │
  ▼
Next Handler

Conceptual request context:

req.user = {
  id,
  email,
  role
}

19. Role Authorization Middleware

After authentication, privileged routes can apply role checks.

Example:

requireAuth
      ↓
requireRole("GOVERNMENT_OFFICER")
      ↓
Government API

Citizen route:

requireAuth
      ↓
requireRole("CITIZEN")
      ↓
Citizen API

20. Authorization Matrix

Operation

Citizen

Government Officer

Sign up

✅

✅

Sign in

✅

✅

Get own auth profile

✅

✅

Logout

✅

✅

Forgot password

✅

✅

Access citizen APIs

✅

❌

Access government APIs

❌

✅

Review applications

❌

✅

Approve applications

❌

✅

Reject applications

❌

✅

The final authorization must also be enforced by backend/database policies.

21. Forgot Password

Endpoint

POST /api/v1/auth/forgot-password

Request

{
  "email": "citizen@example.com"
}

The request triggers the Supabase password-recovery flow.

Response

{
  "success": true,
  "message": "If the account exists, password reset instructions have been sent."
}

The response should not reveal whether the email is registered.

22. Password Reset

Password reset is handled through Supabase Auth recovery.

Flow:

Forgot Password
      ↓
Supabase Recovery Email
      ↓
User Opens Recovery Link
      ↓
Recovery Session
      ↓
New Password
      ↓
Supabase Auth
      ↓
Password Updated

SetuX must not store the new password itself.

23. Logout

Logout is primarily a Supabase Auth operation.

Frontend:

supabase.auth.signOut()

Flow:

User clicks Logout
       ↓
Supabase signOut
       ↓
Session removed
       ↓
Frontend returns to Auth Screen

24. Session Management

The frontend maintains the Supabase authentication session.

For protected requests:

Authorization: Bearer <access_token>

Backend:

Token
  ↓
Verify
  ↓
User ID
  ↓
Role
  ↓
Authorization

The application must never trust these client-provided values as identity:

user_id in request body
role in request body
role in localStorage
X-User-ID header

25. Remember Me

The authentication UI contains:

☑ Remember me

For the MVP, session persistence should use the Supabase client's supported session persistence behavior.

The application should not implement a custom persistent-session/token system.

26. OAuth / Alternative Providers

The UI may display providers such as:

Google
Government identity provider

For the SIH MVP, these are optional.

If enabled:

SetuX
  ↓
Supabase OAuth
  ↓
Identity Provider
  ↓
Supabase Session
  ↓
SetuX /auth/me

Only providers actually configured in Supabase should be exposed in the UI.

27. Authentication Error Format

All SetuX authentication API errors should follow a common structure:

{
  "success": false,
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  },
  "request_id": "uuid"
}

28. Authentication Error Codes

AUTH_INVALID_CREDENTIALS
AUTH_EMAIL_NOT_VERIFIED
AUTH_SESSION_EXPIRED
AUTH_TOKEN_INVALID
AUTH_TOKEN_MISSING
AUTH_ACCOUNT_DISABLED
AUTH_RATE_LIMITED
AUTH_PROVIDER_ERROR

Profile/authorization errors:

PROFILE_NOT_FOUND
INVALID_ROLE
ROLE_NOT_AUTHORIZED

29. HTTP Status Codes

Status

Meaning

200

Successful authentication/profile request

201

Account created

400

Invalid request

401

Missing or invalid authentication

403

Authenticated but not authorized

409

Account/profile conflict

422

Validation failure

429

Too many requests

500

Internal server error

30. Security Requirements

Never store

Plaintext passwords
Supabase service-role key in frontend
Authentication secrets in source code
Access tokens in normal application tables

Never trust

Frontend role
Frontend user ID
Frontend authorization state
Client-side permissions

Always validate

JWT
Authenticated user
Role
Request body
Resource ownership
Permission

31. Rate Limiting

Authentication endpoints should be protected against abuse.

Apply rate limiting to:

Signup
Login
Forgot password
Password recovery

Example:

Too many attempts
       ↓
HTTP 429
       ↓
AUTH_RATE_LIMITED

Exact limits can be configured for the MVP deployment.

32. Authentication Audit Events

Security-relevant authentication events should be recorded.

Examples:

ACCOUNT_CREATED
EMAIL_VERIFIED
LOGIN_SUCCESS
LOGIN_FAILED
LOGOUT
PASSWORD_RESET_REQUESTED
PASSWORD_CHANGED

Do not log:

Passwords
Access tokens
Recovery tokens
Sensitive credentials

33. Frontend Route Guard

Authentication state controls frontend navigation.

                 SetuX
                   │
                   ▼
              Auth Screen
                   │
              Authenticated?
               /         \
             NO           YES
             │             │
             ▼             ▼
        Stay on Auth    /auth/me
                           │
                           ▼
                       Resolve Role
                       /          \
                 CITIZEN       GOVERNMENT
                    │             │
                    ▼             ▼
              Citizen App    Government App

The frontend route guard is for navigation and UX.

It is not the security boundary.

The backend and database must independently enforce authorization.

34. End-to-End Authentication Architecture

                           SETUX
                             │
                             ▼
                    ┌─────────────────┐
                    │ Authentication  │
                    │     Screen      │
                    └────────┬────────┘
                             │
                       Email + Password
                             │
                             ▼
                    ┌─────────────────┐
                    │  Supabase Auth  │
                    └────────┬────────┘
                             │
                         Session/JWT
                             │
                             ▼
                    ┌─────────────────┐
                    │  SetuX API      │
                    │  /api/v1/auth   │
                    └────────┬────────┘
                             │
                        Verify JWT
                             │
                             ▼
                       Auth User ID
                             │
                             ▼
                          profiles
                             │
                       Resolve Role
                       /           \
                      /             \
                 CITIZEN       GOVERNMENT_OFFICER
                    │                 │
                    ▼                 ▼
              Citizen APIs      Government APIs

35. API Endpoint Summary

SetuX Authentication APIs

POST   /api/v1/auth/signup
GET    /api/v1/auth/me
POST   /api/v1/auth/forgot-password

Supabase Auth Operations

signInWithPassword()
signOut()
email verification
password recovery
OAuth

36. MVP Definition of Done

Account

Supabase Auth configured

Email/password signup working

Email verification working

Login working

Logout working

Forgot-password flow working

Session

Supabase session handled by frontend

JWT attached to protected requests

JWT verified by backend

Expired sessions handled

/auth/me implemented

Roles

Citizen role supported

Government Officer role supported

Role stored in profiles

Backend resolves role from authenticated user

Government access protected

Security

Authentication middleware implemented

Role authorization implemented

RLS configured

Rate limiting added

Sensitive credentials excluded from logs

Authentication events audited

37. Final Design Principle

SetuX authentication follows this separation:

                 SUPABASE AUTH
                       │
                       ▼
            Identity + Credentials
                       │
                       ▼
                  Session/JWT
                       │
                       ▼
                SETUX PROFILE
                       │
                       ▼
                    Role
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
          CITIZEN        GOVERNMENT_OFFICER
             │                   │
             ▼                   ▼
       Citizen Access      Government Access

The core rule is:

Supabase authenticates the user; SetuX determines what that authenticated user is allowed to access.