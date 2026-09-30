export const BUSINESS = {
  name: "Best Auto Repair",
  phone: "+1 (808) 743-4377",
  phoneHref: "tel:+18087434377",
  address: "91-1018 Lipo St",
  locality: "Kapolei, Hawaii",
  hours: "By appointment",
  hoursDetail: "Call to arrange a visit. All times are Hawaii Standard Time.",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=91-1018%20Lipo%20St%2C%20Kapolei%2C%20Hawaii",
} as const;

export const MARKETING_SERVICES = [
  {
    slug: "auto-repair",
    title: "Auto Repair",
    short: "Maintenance and repair to keep your vehicle ready for the road.",
    icon: "wrench",
    image: 0,
    local: true,
    intro: "Practical care for your daily drive.",
    description:
      "Bring your vehicle to our Kapolei location for an assessment of its maintenance and repair needs. We discuss the findings and proposed work with you before getting started.",
    details: [
      "Vehicle condition and maintenance assessment",
      "Mechanical fault diagnosis",
      "A clear explanation of the recommended work",
    ],
    prepare:
      "Tell us the make, model, year, symptoms, and any recent repairs. Call before visiting so we can arrange a time.",
  },
  {
    slug: "diagnostics",
    title: "Diagnostics",
    short: "Find the cause of mechanical and electronic system faults.",
    icon: "monitor",
    image: 1,
    local: true,
    intro: "Understand the fault. Plan the right repair.",
    description:
      "Warning lights are the starting point, not the complete diagnosis. We assess the vehicle’s symptoms and electronic systems to help identify the next step.",
    details: [
      "Electronic system and diagnostic trouble code checks",
      "Communication and module fault assessment",
      "Repair recommendations based on the findings",
    ],
    prepare:
      "Bring any diagnostic reports you already have. Tell us when the fault occurs and whether any parts have recently been replaced.",
  },
  {
    slug: "airbag-reset",
    title: "Airbag & System Reset",
    short: "Airbag reset, battery reset, ECM reset, SAS reset, and more.",
    icon: "shield",
    image: 2,
    local: false,
    intro: "Support checked against your exact module.",
    description:
      "Airbag and SRS crash data reset is available only for supported module part numbers. We review the label and relevant diagnostic information before confirming the work.",
    details: [
      "Exact SRS module part-number compatibility check",
      "Crash data reset where explicitly supported",
      "Manual review for unknown or restricted modules",
    ],
    prepare:
      "Provide a clear module-label photo, accident history, and any DTCs. Resetting a module does not replace physical airbag or restraint-system repairs.",
  },
  {
    slug: "module-cloning",
    title: "ECU / TCU / BCM Cloning",
    short: "Explore data transfer between original and donor modules.",
    icon: "cpu",
    image: 3,
    local: false,
    intro: "Your original data. A compatible replacement.",
    description:
      "Cloning and data transfer depend on the original module, donor hardware, and the operation supported for both units. Compatibility is confirmed before a service is offered.",
    details: [
      "Original and donor part-number review",
      "ECM, transmission, and body-module assessment",
      "Required modules and follow-up coding explained upfront",
    ],
    prepare:
      "Have the original and donor module labels ready. We will tell you which units to send; do not assume two similar-looking modules are compatible.",
  },
  {
    slug: "module-programming",
    title: "Module Programming",
    short: "Programming preparation and recovery for supported modules.",
    icon: "chip",
    image: 4,
    local: false,
    intro: "A precise approach to automotive electronics.",
    description:
      "We assess VIN writing, preparation for programming, and software recovery for your specific module. Availability depends on its part number, condition, and the requested operation.",
    details: [
      "Part-specific VIN writing assessment",
      "Preparation for programming or coding",
      "Software and data recovery review",
    ],
    prepare:
      "Tell us what happened before the failure and whether the module still communicates. We will explain if on-car coding is required after installation.",
  },
  {
    slug: "hybrid-battery",
    title: "Prius Battery Repair",
    short: "Discuss diagnosis and repair options for your hybrid battery.",
    icon: "leaf",
    image: 5,
    local: true,
    intro: "Get a clear picture of your hybrid’s health.",
    description:
      "Contact us to discuss your Toyota Prius or other hybrid vehicle’s battery symptoms and arrange a local assessment. The available repair options depend on the vehicle and battery condition.",
    details: [
      "Vehicle and battery-system symptom review",
      "Diagnostic assessment by appointment",
      "Repair scope discussed before work begins",
    ],
    prepare:
      "Have your vehicle year and any warning messages or diagnostic codes available when you call. Battery services are arranged locally, not through module mail-in shipping.",
  },
  {
    slug: "keys-immobilizers",
    title: "Key & Immobilizer",
    short: "Key and immobilizer support, matched to your vehicle.",
    icon: "key",
    image: 6,
    local: true,
    intro: "Help with the systems that get you moving.",
    description:
      "Tell us your vehicle details and whether you have a working key. We will check the available key and immobilizer service options and arrange the appropriate local appointment.",
    details: [
      "Vehicle-specific key service assessment",
      "Immobilizer fault diagnostics",
      "Existing-key and all-keys-lost inquiries",
    ],
    prepare:
      "Please have proof of ownership, your vehicle details, and all available keys ready. Call to confirm availability before visiting.",
  },
] as const;

export const MAIL_STEPS = [
  {
    title: "Ship Your Module",
    text: "Start a request and check compatibility. Follow the packing and shipping instructions for your order.",
    image: 7,
  },
  {
    title: "We Diagnose / Clone / Reset",
    text: "We confirm the supported operation and carry out the agreed work with the appropriate equipment.",
    image: 3,
  },
  {
    title: "We Send It Back",
    text: "Your module is checked, carefully packed, and sent back with any installation or coding instructions.",
    image: 7,
  },
] as const;

export const MAIL_FAQS = [
  [
    "Can I send a module from outside Hawaii?",
    "Yes. Our mail-in process is available to customers across the United States. Start a request first so we can confirm the module and the service you need.",
  ],
  [
    "Should I ship before compatibility is confirmed?",
    "Start your request and follow the instructions provided for your order. Do not send unidentified modules or a donor unit unless the instructions specifically request it.",
  ],
  [
    "What should I include for cloning?",
    "Provide photos and part numbers for the original and donor modules. We will confirm whether both are needed and identify the units you should send.",
  ],
  [
    "When do I pay?",
    "A payment link is sent after compatibility and the selected service are confirmed. The order flow shows the applicable service and return-shipping charges.",
  ],
  [
    "How long will it take?",
    "Timing depends on the module, its condition, and the operation requested. We will discuss the expected turnaround for your order; shipping transit time is separate.",
  ],
  [
    "Will the module need programming after installation?",
    "Some replacement modules need on-car programming or coding after installation. We will explain any known follow-up requirements for your selected service.",
  ],
] as const;
