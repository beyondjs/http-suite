## [1.1.0] - 2024-06-28

### Added

-   New `setHeaders` method in the `Fetcher` class to manage headers independently.
-   Improved type definitions across the codebase.
-   Added `IResponse` interface for handling API responses.

### Changed

-   Renamed `JCall` class to `Fetcher` for better clarity and naming consistency.
-   Refactored internal methods to use the new header management functionality.

### Fixed

-   General types fixes and improvements to ensure better type safety and error handling.

### 1.0.3

-   Fix bug returning data in delete method.

### 1.0.2:

In version 1.0.2 of the @aimpact/http-suite package, two significant modifications have been made to improve
functionality and user experience:

1. flexibility in DELETE requests: previously, sending a body ('body') in DELETE requests was mandatory. Now, with the
   update to version 1.0.2, we have made this requirement optional. This provides greater flexibility to the user when
   making DELETE requests.

2. In previous versions, In version 1.0.2, we have introduced a change so that the body of PUT requests can arrive
   without problems, before this did not happen, it only happened with POST requests. lowor
