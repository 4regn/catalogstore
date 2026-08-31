# (model, storage_or_None, sealed_bool, price)
RAW = [
    ("iPhone X", "64GB", False, 3500), ("iPhone X", "64GB", True, 3700),
    ("iPhone X", "256GB", False, 3750), ("iPhone X", "256GB", True, 4300),

    ("iPhone XR", "64GB", False, 3900), ("iPhone XR", "64GB", True, 4500),
    ("iPhone XR", "128GB", False, 4200), ("iPhone XR", "128GB", True, 4900),

    ("iPhone XS", "64GB", False, 3900), ("iPhone XS", "64GB", True, 4300),
    ("iPhone XS", "256GB", False, 4300), ("iPhone XS", "256GB", True, 4500),

    ("iPhone XS Max", "64GB", False, 4300), ("iPhone XS Max", "256GB", False, 4800),
    ("iPhone XS Max", "64GB", True, 4800), ("iPhone XS Max", "256GB", True, 5300),

    ("iPhone 11", "64GB", False, 5800), ("iPhone 11", "64GB", True, 6000),
    ("iPhone 11", "128GB", False, 5900), ("iPhone 11", "128GB", True, 6500),

    ("iPhone 11 Pro", "64GB", False, 6200), ("iPhone 11 Pro", "64GB", True, 6800),
    ("iPhone 11 Pro", "256GB", False, 6500), ("iPhone 11 Pro", "256GB", True, 7300),

    ("iPhone 11 Pro Max", "64GB", False, 6200), ("iPhone 11 Pro Max", "64GB", True, 7100),
    ("iPhone 11 Pro Max", "256GB", False, 7300), ("iPhone 11 Pro Max", "256GB", True, 7900),

    ("iPhone 12", "64GB", False, 6000), ("iPhone 12", "64GB", True, 6800),
    ("iPhone 12", "128GB", False, 6500), ("iPhone 12", "128GB", True, 7000),

    ("iPhone 12 mini", "64GB", False, 5400), ("iPhone 12 mini", "128GB", False, 5900),

    ("iPhone 12 Pro", "128GB", False, 6500), ("iPhone 12 Pro", "128GB", True, 7500),
    ("iPhone 12 Pro", "256GB", False, 7000), ("iPhone 12 Pro", "256GB", True, 7600),

    ("iPhone 12 Pro Max", "128GB", False, 8500), ("iPhone 12 Pro Max", "128GB", True, 9000),
    ("iPhone 12 Pro Max", "256GB", False, 8500), ("iPhone 12 Pro Max", "256GB", True, 9500),

    ("iPhone 13", "128GB", False, 7300), ("iPhone 13", "128GB", True, 8000),
    ("iPhone 13", "256GB", False, 7800), ("iPhone 13", "256GB", True, 8500),

    ("iPhone 13 mini", "128GB", False, 6550),

    ("iPhone 13 Pro", "128GB", False, 9200), ("iPhone 13 Pro", "128GB", True, 9700),
    ("iPhone 13 Pro", "256GB", False, 9700), ("iPhone 13 Pro", "256GB", True, 10500),

    ("iPhone 13 Pro Max", "128GB", False, 9900), ("iPhone 13 Pro Max", "128GB", True, 11000),
    ("iPhone 13 Pro Max", "256GB", False, 10700), ("iPhone 13 Pro Max", "256GB", True, 11800),

    ("iPhone 14", "128GB", False, 7500), ("iPhone 14", "128GB", True, 8500),
    ("iPhone 14", "256GB", False, 8700), ("iPhone 14", "256GB", True, 9000),

    ("iPhone 14 Plus", "128GB", False, 9000), ("iPhone 14 Plus", "128GB", True, 9500),
    ("iPhone 14 Plus", "256GB", False, 9500), ("iPhone 14 Plus", "256GB", True, 9900),

    ("iPhone 14 Pro", "128GB", False, 11200), ("iPhone 14 Pro", "128GB", True, 11800),
    ("iPhone 14 Pro", "256GB", False, 12200), ("iPhone 14 Pro", "256GB", True, 13000),

    ("iPhone 14 Pro Max", "128GB", True, 14200), ("iPhone 14 Pro Max", "256GB", True, 14700),

    ("iPhone 15", "128GB", True, 12300), ("iPhone 15", "256GB", True, 12700),

    ("iPhone 15 Plus", "128GB", True, 13000), ("iPhone 15 Plus", "256GB", True, 13700),

    ("iPhone 15 Pro", "128GB", True, 14500), ("iPhone 15 Pro", "256GB", True, 15200),

    ("iPhone 15 Pro Max", "256GB", True, 17000), ("iPhone 15 Pro Max", "512GB", True, 17500),

    ("iPhone 16", "128GB", True, 14500), ("iPhone 16", "256GB", True, 15200),

    ("iPhone 16 Plus", "128GB", True, 15700), ("iPhone 16 Plus", "256GB", True, 16700),

    ("iPhone 16 Pro", "128GB", True, 17500), ("iPhone 16 Pro", "256GB", True, 18000),

    ("iPhone 16 Pro Max", "256GB", True, 21500), ("iPhone 16 Pro Max", "512GB", True, 22500),

    ("iPhone 17", "256GB", False, 16500),
    ("iPhone 17 Air", None, False, 18000),
    ("iPhone 17 Pro", "256GB", False, 23300),
    ("iPhone 17 Pro Max", "256GB", False, 26500),
]

ERAS = [
    ("X Series", "2018", ["iPhone X", "iPhone XR", "iPhone XS", "iPhone XS Max"]),
    ("11 Series", "2019", ["iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max"]),
    ("12 Series", "2020", ["iPhone 12", "iPhone 12 mini", "iPhone 12 Pro", "iPhone 12 Pro Max"]),
    ("13 Series", "2021", ["iPhone 13", "iPhone 13 mini", "iPhone 13 Pro", "iPhone 13 Pro Max"]),
    ("14 Series", "2022", ["iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max"]),
    ("15 Series", "2023", ["iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max"]),
    ("16 Series", "2024", ["iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max"]),
    ("17 Series", "2025", ["iPhone 17", "iPhone 17 Air", "iPhone 17 Pro", "iPhone 17 Pro Max"]),
]
