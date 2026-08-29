SetuX — Error Handling Design

Version: 1.0
Project: SetuX SIH MVP
Architecture: Modular Monolith
Backend: Supabase + PostgreSQL
Purpose: Define how SetuX detects, classifies, handles, logs, and communicates errors across authentication, onboarding, scholarship applications, consent, workflows, government connectors, and officer actions.

1. Purpose

SetuX connects multiple steps of a scholarship process into one unified workflow.

Because several modules and simulated government systems participate in the process, failures must be handled consistently.

The system must distinguish between:

CLIENT ERROR
SERVER ERROR
AUTHENTICATION ERROR
AUTHORIZATION ERROR
VALIDATION ERROR
WORKFLOW ERROR
CONNECTOR ERROR
DATABASE ERROR
SYSTEM ERROR

The goal is:

An error in one component should not turn into an unexplained failure for the entire system.

For the SIH prototype, errors should be:

predictable

safe

traceable

user-friendly

recoverable where possible

demonstrable during the SIH presentation

2. Error Handling Principles

SetuX follows these principles:

1. Validate early.
2. Fail safely.
3. Never expose internal details to users.
4. Return consistent API errors.
5. Log useful diagnostic information.
6. Never log secrets or sensitive data.
7. Distinguish retryable from non-retryable errors.
8. Preserve application state during failures.
9. Never silently ignore critical errors.
10. Audit security-sensitive failures.

3. High-Level Error Flow

Client Request
      ↓
API Controller
      ↓
Input Validation
      ↓
Authentication
      ↓
Authorization
      ↓
Service Layer
      ↓
Workflow
      ↓
Connector / Database
      ↓
Error?
  ┌───┴────┐
 NO       YES
 │         │
 ▼         ▼
Success  Error Handler
            │
     ┌──────┼───────┐
     ▼      ▼       ▼
  Log/Audit Classify Recover
            │
            ▼
      Safe API Response
            │
            ▼
          Client

4. Error Categories

4.1 Validation Error

The request does not satisfy the expected schema.

Example:

Phone number missing
Invalid government ID format
Invalid application field

Response:

400 Bad Request

4.2 Authentication Error

The request does not contain a valid authenticated identity.

Examples:

No access token
Expired session
Invalid token

Response:

401 Unauthorized

4.3 Authorization Error

The user is authenticated but does not have permission.

Examples:

Citizen attempts approval
Officer accesses unauthorized application
User accesses another citizen's resource

Response:

403 Forbidden

4.4 Not Found Error

The requested resource does not exist or should not be exposed.

Examples:

Application does not exist
Credential does not exist
User does not exist

Response:

404 Not Found

4.5 Conflict Error

The requested operation conflicts with the current resource state.

Examples:

Application already submitted
Application already approved
Consent already revoked
Duplicate application

Response:

409 Conflict

4.6 Workflow Error

The requested operation is not valid for the current workflow state.

Example:

Citizen tries to edit an application
after it has already been approved.

Response:

409 Conflict

4.7 Connector Error

A government connector fails.

Examples:

Provider timeout
Provider unavailable
Provider returns invalid response
Credential not found
Identity mismatch

These must be classified further as:

RETRYABLE
NON_RETRYABLE

4.8 Database Error

The database cannot complete an operation.

Examples:

Connection failure
Constraint violation
Unexpected query failure
Transaction failure

Usually:

500 Internal Server Error

The detailed database error must never be returned to the client.

4.9 Internal Server Error

An unexpected backend failure.

Response:

500 Internal Server Error

The user receives a generic message.

The server logs the actual diagnostic information.

5. Standard API Error Response

All SetuX APIs should return a consistent structure.

Example:

{
  "success": false,
  "error": {
    "code": "APPLICATION_NOT_FOUND",
    "message": "The requested application could not be found.",
    "details": null,
    "requestId": "req_12345"
  }
}

For validation:

{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "details": {
      "phone": "Invalid phone number"
    },
    "requestId": "req_12345"
  }
}

6. Error Response Fields

Recommended fields:

success
error.code
error.message
error.details
error.requestId

success

Always:

false

for an error response.

code

Machine-readable identifier.

Example:

APPLICATION_NOT_FOUND

message

Safe human-readable message.

details

Optional structured information.

Do not place secrets or sensitive internal information here.

requestId

Used by support/developers to trace the request.

7. HTTP Status Code Convention

Status

Meaning

Example

400

Bad Request

Invalid input

401

Unauthorized

Missing/invalid session

403

Forbidden

Insufficient permission

404

Not Found

Application not found

409

Conflict

Invalid current state

422

Unprocessable Entity

Semantically invalid data, if used

429

Too Many Requests

Rate limit

500

Internal Server Error

Unexpected failure

502

Bad Gateway

Provider returned invalid/unusable response

503

Service Unavailable

Provider unavailable

504

Gateway Timeout

Provider timeout

The project should use a small, consistent subset rather than creating unnecessary status-code variations.

8. Error Code Naming Convention

Use uppercase snake case.

AUTH_INVALID_TOKEN
AUTH_SESSION_EXPIRED

FORBIDDEN_ACTION
RESOURCE_NOT_FOUND

VALIDATION_ERROR
DUPLICATE_APPLICATION

APPLICATION_NOT_FOUND
APPLICATION_INVALID_STATE

CONSENT_REQUIRED
CONSENT_REVOKED

CONNECTOR_TIMEOUT
CONNECTOR_UNAVAILABLE
CONNECTOR_INVALID_RESPONSE
CREDENTIAL_NOT_FOUND
IDENTITY_MISMATCH

DATABASE_ERROR
INTERNAL_ERROR
RATE_LIMIT_EXCEEDED

9. Backend Error Classes

The backend can use typed/custom errors.

Conceptual structure:

class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  retryable?: boolean;
}

Specialized errors can extend it:

ValidationError
AuthenticationError
AuthorizationError
NotFoundError
ConflictError
ConnectorError
DatabaseError
InternalError

This allows the global error handler to treat errors consistently.

10. Global Error Handler

All unhandled backend errors should pass through one global error handler.

Controller
    ↓
Service
    ↓
Error
    ↓
Global Error Handler
    ↓
Classify
    ↓
Log
    ↓
Safe Response

The global handler should:

identify the error

determine HTTP status

determine error code

log diagnostic context

generate/request a request ID

return a safe response

11. Never Leak Internal Errors

Incorrect:

{
  "error": "PostgresError: relation applications does not exist"
}

Correct:

{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Something went wrong. Please try again.",
    "requestId": "req_12345"
  }
}

Detailed diagnostics stay in server logs.

12. Request ID

Every API request should have a request ID.

Request
  ↓
requestId = req_123
  ↓
Controller
  ↓
Service
  ↓
Database/Connector
  ↓
Logs use req_123

This allows:

User sees:
"Something went wrong. Reference: req_123"

Developer searches:
req_123

and can find the complete error path.

13. Logging Strategy

Logs should contain enough information to diagnose problems.

Recommended:

requestId
timestamp
module
operation
userId where appropriate
applicationId where appropriate
errorCode
statusCode
provider
retryable
stack trace for internal errors

Do not log:

passwords
access tokens
service-role keys
API keys
full government IDs
complete documents
unnecessary personal information

14. Error Severity

Errors can be classified as:

INFO
WARNING
ERROR
CRITICAL

INFO

Expected recoverable event.

Example:

Connector retry succeeded.

WARNING

Unexpected but handled event.

Example:

Provider temporarily unavailable.

ERROR

Operation failed.

Example:

Application submission failed.

CRITICAL

Potential system-wide/security problem.

Example:

Database unavailable
Authentication infrastructure failure
Repeated authorization anomalies

15. Validation Error Flow

Frontend Request
      ↓
API
      ↓
Schema Validation
      ↓
Invalid?
  ┌───┴───┐
 YES      NO
  │        │
  ▼        ▼
400       Service

Example:

{
  "name": "",
  "phone": "abc"
}

Response:

{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the submitted information.",
    "details": {
      "name": "Name is required",
      "phone": "Invalid phone number"
    },
    "requestId": "req_123"
  }
}

16. Authentication Error Flow

Request
  ↓
Validate Token
  ↓
Valid?
 ┌──┴──┐
NO    YES
│       │
▼       ▼
401    Continue

Example:

{
  "success": false,
  "error": {
    "code": "AUTH_INVALID_TOKEN",
    "message": "Authentication is required.",
    "requestId": "req_123"
  }
}

Do not reveal unnecessary information about why token validation failed.

17. Authorization Error Flow

Authenticated
     ↓
Resolve Role
     ↓
Check Permission
     ↓
Allowed?
  ┌──┴──┐
 NO    YES
 │      │
 ▼      ▼
403   Continue

Example:

Citizen
   ↓
POST /applications/APP-001/approve
   ↓
Permission denied
   ↓
403 FORBIDDEN

18. Resource Ownership Error

Citizen A
   ↓
GET Application B
   ↓
Ownership Check
   ↓
Not Owner
   ↓
Access Denied

The implementation should avoid revealing unnecessary information about resources that the user is not authorized to access.

19. Application Errors

Possible application errors:

APPLICATION_NOT_FOUND
APPLICATION_ALREADY_EXISTS
APPLICATION_INVALID_STATE
APPLICATION_ALREADY_SUBMITTED
APPLICATION_ALREADY_APPROVED
APPLICATION_ALREADY_REJECTED
APPLICATION_SUBMISSION_FAILED

Example:

APPROVED
   ↓
Citizen tries to edit
   ↓
APPLICATION_INVALID_STATE

Response:

409 Conflict

20. State Transition Errors

Application states:

DRAFT
  ↓
SUBMITTED
  ↓
UNDER_VERIFICATION
  ↓
UNDER_REVIEW
  ↓
APPROVED

Alternative:

UNDER_REVIEW
     ↓
REJECTED

Invalid transitions must be rejected.

Example:

APPROVED
   ↓
SUBMITTED

is invalid.

Response:

{
  "success": false,
  "error": {
    "code": "APPLICATION_INVALID_STATE",
    "message": "This application cannot be modified in its current state.",
    "requestId": "req_123"
  }
}

21. Consent Errors

Possible codes:

CONSENT_REQUIRED
CONSENT_NOT_FOUND
CONSENT_REVOKED
CONSENT_EXPIRED
CONSENT_INVALID

Flow:

Connector Request
      ↓
Consent Check
      ↓
Granted?
 ┌────┴────┐
 NO        YES
 │          │
 ▼          ▼
CONSENT    Connector
_REQUIRED

The connector must not proceed when required consent is missing.

22. Connector Error Model

Connector errors should contain:

provider
operation
errorCode
retryable
attempt
requestId

Example:

{
  "provider": "FAKE_DIGILOCKER",
  "operation": "GET_CREDENTIAL",
  "errorCode": "CONNECTOR_TIMEOUT",
  "retryable": true,
  "attempt": 1
}

23. Connector Error Categories

Timeout

CONNECTOR_TIMEOUT

Usually retryable.

Provider unavailable

CONNECTOR_UNAVAILABLE

Usually retryable.

Invalid provider response

CONNECTOR_INVALID_RESPONSE

Usually not automatically retryable.

Credential not found

CREDENTIAL_NOT_FOUND

Not retryable unless the provider's semantics indicate eventual availability.

Identity mismatch

IDENTITY_MISMATCH

Not retryable.

Provider error

CONNECTOR_PROVIDER_ERROR

Retryability depends on the provider response.

24. Retry Strategy

For retryable connector errors:

Attempt 1
   ↓
Failure
   ↓
Attempt 2
   ↓
Failure
   ↓
Attempt 3
   ↓
Failure
   ↓
Mark failed

For the MVP:

MAX_RETRIES = 3

Avoid infinite retries.

25. Retryable vs Non-Retryable

Error

Retry

Timeout

Yes

Temporary unavailable

Yes

Provider 5xx

Usually

Network failure

Yes

Invalid request

No

Consent denied

No

Identity mismatch

No

Credential not found

Usually no

Invalid credential

No

26. Connector Failure State

If all retries fail:

CONNECTOR FAILED
       ↓
Workflow Step = BLOCKED / FAILED
       ↓
Application remains traceable
       ↓
Audit Event
       ↓
Citizen/Officer informed

Do not silently mark the verification as successful.

27. Partial Failure

SetuX may have multiple verification steps.

Example:

Identity       ✓
Education      ✓
Income         ✗

The application should not be treated as fully verified.

Instead:

Identity Verification = VERIFIED
Education Verification = VERIFIED
Income Verification = FAILED
Overall Workflow = BLOCKED

This preserves the actual state.

28. Recovery

When a retry succeeds:

FAILED
  ↓
RETRY
  ↓
SUCCESS
  ↓
Verification Completed
  ↓
Workflow Continues

Record:

failure event
retry event
recovery event

This provides traceability.

29. Database Error Handling

Database errors should be caught at the service/repository boundary.

Service
   ↓
Database
   ↓
Error
   ↓
Database Error Handler
   ↓
Log
   ↓
Safe AppError
   ↓
500

Do not expose:

SQL statements
database schema internals
connection strings
database credentials
stack traces

30. Database Constraint Errors

Example:

Duplicate application

The database may reject an insert.

The backend should convert this into a meaningful application error:

409 CONFLICT

rather than returning a raw database error.

31. Transaction Failure

For operations involving multiple related writes:

Application Update
+
Workflow Update
+
Audit Event

the implementation should consider transactional consistency where supported.

If the operation cannot be completed safely:

Rollback / compensate
       ↓
Return error
       ↓
Log

The system must avoid leaving an application in an impossible state.

32. Notification Errors

Notifications should not unnecessarily destroy the primary workflow.

Example:

Application Approved
      ↓
Database updated ✓
      ↓
Notification failed ✗

The application should remain:

APPROVED

and the notification failure should be recorded separately.

This is an example of a non-critical secondary failure.

33. Frontend Error Handling

Frontend should convert API errors into understandable messages.

Backend:

APPLICATION_INVALID_STATE

Frontend:

"This application can no longer be edited because it has already been processed."

Do not expose:

stack traces
database errors
internal provider responses

34. User-Facing Error Categories

The frontend should show errors based on user action.

Validation

"Please correct the highlighted fields."

Authentication

"Your session has expired. Please sign in again."

Permission

"You do not have permission to perform this action."

Connector unavailable

"The verification service is temporarily unavailable. Please try again."

Identity mismatch

"The identity details could not be verified."

Unexpected error

"Something went wrong. Please try again later."

35. Do Not Blame the User

System failures should not be presented as user mistakes.

Bad:

"Invalid application."

when the government provider is unavailable.

Better:

"The verification service is temporarily unavailable."

36. Error Recovery UI

For recoverable errors:

Verification failed temporarily.

[ Try Again ]

For non-recoverable errors:

Identity details could not be verified.

Please review your information.

For system failures:

We could not complete this request.

Reference: req_12345

37. Error Handling for Scholarship Workflow

Complete flow:

Application
    ↓
Identity Verification
    │
    ├── Success → Continue
    ├── Mismatch → Block
    └── Timeout → Retry
                     │
                     ├── Success → Continue
                     └── Failure → Block
    ↓
Education Verification
    │
    ├── Success → Continue
    ├── Not Found → Block / Action Required
    └── Timeout → Retry
    ↓
Income Verification
    │
    ├── Success → Continue
    └── Failure → Block
    ↓
Officer Review
    ↓
Approve / Reject

38. Error Handling for Officer Actions

Officer action:

Approve
   ↓
Authenticate
   ↓
Authorize
   ↓
Application Scope Check
   ↓
State Check
   ↓
Approve
   ↓
Audit

If any check fails:

No state modification
No approval event
Safe error response
Audit security-sensitive failure where appropriate

39. Security Errors

Security-sensitive failures include:

INVALID_TOKEN
FORBIDDEN_ACTION
UNAUTHORIZED_RESOURCE_ACCESS
CONSENT_BYPASS_ATTEMPT
INVALID_ROLE_OPERATION

These should be logged carefully.

The logs should contain enough context to investigate without storing secrets.

40. Rate Limit Errors

When a rate limit is exceeded:

429 Too Many Requests

Example:

{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "requestId": "req_123"
  }
}

41. Idempotency and Duplicate Requests

Critical operations should protect against accidental repeated requests.

Examples:

Submit Application
Grant Consent
Approve Application
Retrieve Credential

Possible approach:

Request
   ↓
Idempotency Key
   ↓
Check previous operation
   ↓
Already completed?
 ┌────┴────┐
YES       NO
 │         │
 ▼         ▼
Return    Execute
existing
result

42. Error Audit Events

Important errors should generate audit/security events.

Examples:

AUTHENTICATION_FAILED
AUTHORIZATION_DENIED
CONSENT_ACCESS_BLOCKED
CONNECTOR_FAILED
CONNECTOR_RETRIED
APPLICATION_STATE_CONFLICT
OFFICER_ACTION_DENIED

Not every harmless validation error needs a permanent audit event.

43. Error Monitoring

For the MVP, the admin/monitoring view can show:

Connector Status
Recent Failures
Failed Applications
Retry Attempts
Provider Errors
System Errors

Example:

Fake DigiLocker
────────────────────────
Status: DEGRADED

Timeouts: 3
Successful Retries: 2
Failed Operations: 1

44. Fake Connector Error Simulation

Because the SIH prototype uses fake government connectors, the team should intentionally support controlled failures.

Modes:

NORMAL
TIMEOUT
UNAVAILABLE
MISMATCH
NOT_FOUND
INVALID_RESPONSE

This allows the judges to see that SetuX is not simply a happy-path demo.

45. SIH Error Demonstration

Recommended live demonstration:

Citizen submits scholarship
        ↓
Education verification
        ↓
Fake DigiLocker
        ↓
TIMEOUT
        ↓
SetuX detects retryable error
        ↓
Retry
        ↓
Fake DigiLocker responds
        ↓
Verification succeeds
        ↓
Workflow continues

Then demonstrate:

Identity mismatch
        ↓
Verification fails
        ↓
Workflow blocked
        ↓
Officer sees reason

This demonstrates actual interoperability error handling.

46. Error Handling Architecture

                         SETUX API
                            │
                            ▼
                    ┌───────────────┐
                    │ Error Handler │
                    └───────┬───────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        Validation       Auth/RBAC      Business
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                       Workflow
                            │
                            ▼
                       Connectors
                            │
                     ┌──────┴──────┐
                     ▼             ▼
                  Timeout       Provider
                     │            Error
                     └──────┬─────┘
                            ▼
                      Classification
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
               Retryable          Non-Retryable
                  │                   │
                  ▼                   ▼
                Retry             Fail Safely
                  │                   │
                  └─────────┬─────────┘
                            ▼
                      Audit / Logging
                            │
                            ▼
                     Safe API Response

47. Recommended Backend Error Structure

src/
└── shared/
    └── errors/
        ├── app-error.ts
        ├── error-codes.ts
        ├── error-handler.ts
        ├── error-response.ts
        └── index.ts

Connector-specific errors can remain within the connector module while being converted to the shared error model.

48. Recommended Error Handling Middleware

Conceptually:

app.use(errorHandler);

The global handler should:

if known AppError:
    return mapped response

if validation error:
    return 400

if authentication error:
    return 401

if authorization error:
    return 403

if database error:
    log
    return 500

if unknown error:
    log
    return 500

The exact implementation should follow the project's existing backend framework.

49. Error Handling Responsibilities

Component

Responsibility

Frontend

Display understandable messages

API Controller

Receive request and pass errors

Validation Layer

Validate input

Auth Layer

Validate session

RBAC

Check permissions

Service Layer

Handle business errors

Workflow

Handle state/retry decisions

Connector

Normalize provider failures

Database Layer

Convert DB failures

Error Handler

Standardize responses

Audit

Record important events

Logger

Store diagnostic information

50. What the Error Handler Must NOT Do

The global error handler should not:

perform business logic

retry arbitrary operations

modify application status without workflow instructions

expose stack traces

expose database details

expose secrets

silently swallow errors

Retry logic belongs close to the operation that understands whether retrying is safe.

51. Definition of Done

API

Standard error response defined

Error codes defined

HTTP status convention defined

Request ID implemented

Global error handler implemented

Authentication / RBAC

401 handled

403 handled

Unauthorized resource access handled

Security-sensitive failures logged

Validation

Request validation implemented

Field-level validation errors supported

Invalid input never reaches business logic

Applications

Not-found errors handled

Duplicate application handled

Invalid state transitions handled

Submission failures handled

Consent

Missing consent handled

Revoked consent handled

Connector access blocked without consent

Connectors

Timeout handled

Provider unavailable handled

Invalid response handled

Not-found handled

Identity mismatch handled

Retryable errors identified

Maximum retry count enforced

Failed operations auditable

Database

DB errors converted to safe responses

Constraint errors mapped appropriately

Sensitive DB details hidden

Frontend

User-friendly messages

Retry action for recoverable failures

Session-expired handling

Request ID shown for unexpected failures where useful

Monitoring

Error logs

Connector failure visibility

Retry tracking

Audit events for critical errors

52. Final Error Handling Principle

SetuX should follow this model:

DETECT
   ↓
CLASSIFY
   ↓
PROTECT
   ↓
RECOVER IF SAFE
   ↓
RECORD
   ↓
RESPOND

In simple terms:

Tell the user what they need to know, tell the system what happened, and never expose information the user should not see.

For the SIH prototype, the most important demonstration is that a government connector can fail without corrupting the scholarship workflow:

Government Service Failure
          ↓
       SetuX
          ↓
     Detect Error
          ↓
   Retry if Possible
          ↓
   Recover / Block Safely
          ↓
      Audit Event
          ↓
     Clear User Status

This makes error handling part of SetuX's interoperability architecture rather than just a collection of API error messages.