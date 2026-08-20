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
      description: For UI changes, add before/after screenshots.
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
