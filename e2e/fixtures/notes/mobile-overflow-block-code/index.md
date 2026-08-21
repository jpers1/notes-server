---
title: "Mobile Overflow Block Code Fixture"
subTitle: "Synthetic narrowed-layout regression"
public: true
tocInHeader: true
requireLogin: false
chapters: []
---

<span className="mobile-horizontal-overflow-fixture" />

This repository-owned fixture narrows the mobile content area before rendering a code block.

```text
synthetic_block_code_line_that_is_deliberately_long_enough_to_require_component_scrolling_1234567890
```

The code block may scroll internally, but the document itself should remain viewport-width.
