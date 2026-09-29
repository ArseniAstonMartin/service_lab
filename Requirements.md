A unified checkout flow, where the list of available services changes dynamically depending on the selected module and its compatibility.

**Vehicle Selection**
Make → model → year. Clicking "Continue" opens the page with module categories.

**Module Selection**
For example: Airbag / SRS, Engine Control Module, Transmission Control Module, Body Control Module, Instrument Cluster.

*SRS and Airbag will be treated as a single category here.*

**Compatibility Check**
The customer enters the Part Number (the catalog number of the module, not its individual serial number). Next to the input field, there is a label example and an option to upload a photo.

The website checks the specific number and displays which services are available for it. If there is no match, it offers to send a photo for manual verification.

**Service Selection**
Each category has its own specific options. For example:

| Module | Available Services (Only with Confirmed Support) |
| :--- | :--- |
| **Airbag / SRS** | Crash Data Reset |
| **ECM / PCM** | Cloning, VIN writing, preparation for programming/coding, software recovery |
| **TCM / TCU** | Cloning, preparation for replacement, data recovery |
| **BCM** | Data transfer, cloning, preparation for programming/coding |
| **Instrument Cluster** | Data transfer on replacement, software recovery, repair |

Support must be verified for the combination of "module part number + selected operation". For example, cloning might be available for a specific ECM, but a standalone VIN change might not be.

**Order Information**
Mandatory field: "Describe what needs to be done and what happened to the module."

Additional questions appear based on the selected service:
* **For SRS:** Was the vehicle in an accident? What diagnostic trouble codes (DTCs) are present?
* **For cloning:** Are both the original module and the donor available? Photos and part numbers of both.
* **For VIN writing:** Current and target VIN, vehicle information.
* **For recovery:** Does the module communicate (respond to diagnostics)? What happened prior to failure?

For cloning services, the website must immediately explain which specific modules the customer needs to mail in. For services requiring subsequent programming/coding on the vehicle, it should state whether on-car work will be needed after installation.

This way, the customer only sees options applicable to their specific module, and you receive an order with all the necessary data even before the package arrives.

**Compatibility Database / Directory (Make / Model / Year / Module Name / Part Number):**
* **Data Source:** Parsing / importing supported module lists from programmer tool manufacturers (requires a collection/normalization script; a manual admin CRUD interface for this database is preferred).