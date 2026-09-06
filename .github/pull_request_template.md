---
name: Pull Request
description: Submit changes to passalong
title: ""
labels: []
body:
  - type: markdown
    attributes:
      value: |
        Thanks for contributing! Please target this PR at `develop` — `main` is release-only.
  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: What does this PR change and why?
    validations:
      required: true
  - type: textarea
    id: tests
    attributes:
      label: Testing
      description: How was this change tested?
      placeholder: |
        - [ ] pnpm test
        - [ ] pnpm lint
        - [ ] Manual test (describe what you did)
    validations:
      required: true
  - type: textarea
    id: screenshots
    attributes:
      label: Screenshots
      description: For UI changes, show the current screenshots in this section — refreshed for this commit.
    validations:
      required: true
  - type: checkboxes
    id: checklist
    attributes:
      label: Checklist
      options:
        - label: I read the CONTRIBUTING guide
          required: true
        - label: My commits follow Conventional Commits
          required: true
        - label: No personal/hardcoded references (i18n-first)
        - label: "UI change: screenshots are committed, refreshed for this commit, and the description above shows the latest ones"
