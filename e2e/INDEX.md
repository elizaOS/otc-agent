# E2E Test Suite - Index

## 📚 Start Here

New to E2E testing? Start with these in order:

1. **[QUICK_START.md](QUICK_START.md)** ⚡
   - 5-minute getting started guide
   - Run your first test
   - Understand the basics

2. **[../E2E_TESTING.md](../E2E_TESTING.md)** 📖
   - Main guide at project root
   - Overview of what's tested
   - Quick commands

3. **[README.md](README.md)** 📚
   - Comprehensive testing guide
   - Writing new tests
   - Debugging tips
   - Best practices

## 📊 Reference Docs

### Coverage & Metrics

- **[TEST_COVERAGE.md](TEST_COVERAGE.md)** - Detailed coverage matrix
- **[TEST_SUMMARY.md](TEST_SUMMARY.md)** - High-level overview
- **[VERIFICATION.md](VERIFICATION.md)** - Setup verification checklist

### Quick References

- **[../TEST_GUIDE.md](../TEST_GUIDE.md)** - Command cheat sheet
- **[../TESTING_COMPLETE.md](../TESTING_COMPLETE.md)** - Implementation summary

## 🗂️ Test Files

| File | Tests | Focus | Duration |
|------|-------|-------|----------|
| `01-pages.spec.ts` | 13 | Page loads, navigation | ~3 min |
| `02-evm-wallet.spec.ts` | 10 | MetaMask + EVM | ~8 min |
| `03-solana-wallet.spec.ts` | 6 | Solana UI | ~4 min |
| `04-complete-flows.spec.ts` | 8 | User journeys | ~15 min |
| `05-components.spec.ts` | 25 | UI components | ~10 min |
| `06-modals-and-dialogs.spec.ts` | 12 | Modals | ~8 min |
| Legacy files | 4 | Old tests | ~5 min |

**Total**: 86 tests, ~20-30 min

## 🎯 Common Tasks

### Run Tests

```bash
npm run test:e2e              # All tests
npm run test:e2e:pages        # Just pages
npm run test:e2e:wallet       # Wallet tests
npm run test:e2e:flows        # User flows
npm run test:e2e:components   # Components
```

### Debug

```bash
npm run test:e2e:headed       # See browser
npm run test:e2e:debug        # Inspector
npm run test:e2e:ui           # Interactive
```

### Results

```bash
npm run test:e2e:report       # HTML report
```

## 🔍 Find What You Need

### "How do I run tests?"
→ [QUICK_START.md](QUICK_START.md)

### "How do I write a test?"
→ [README.md](README.md) - "Writing New Tests" section

### "What's tested?"
→ [TEST_COVERAGE.md](TEST_COVERAGE.md)

### "Why did my test fail?"
→ [README.md](README.md) - "Common Issues" section

### "How do I debug?"
→ [README.md](README.md) - "Debugging" section

### "What about Solana?"
→ [README.md](README.md) - "Web3 Testing" section

### "How do I verify setup?"
→ [VERIFICATION.md](VERIFICATION.md)

### "What's the architecture?"
→ [TEST_SUMMARY.md](TEST_SUMMARY.md)

## 🎓 Learning Path

### Beginner

1. Read [QUICK_START.md](QUICK_START.md)
2. Run `npm run test:e2e:pages`
3. View report: `npm run test:e2e:report`
4. Explore test files

### Intermediate

1. Read [README.md](README.md)
2. Run full suite: `npm run test:e2e`
3. Review [TEST_COVERAGE.md](TEST_COVERAGE.md)
4. Write your first test

### Advanced

1. Study [TEST_SUMMARY.md](TEST_SUMMARY.md)
2. Review existing test patterns
3. Implement complex flows
4. Optimize test performance

## 🏆 Quality Standards

Tests should:
- [ ] Have descriptive names
- [ ] Test one thing
- [ ] Be independent
- [ ] Handle missing data
- [ ] Use data-testid selectors
- [ ] Have appropriate timeouts
- [ ] Include comments for complexity

## 📞 Support

**Questions?**
→ See [README.md](README.md) - "Common Issues"

**Setup Issues?**
→ Run `bash scripts/verify-e2e-setup.sh`

**Test Failures?**
→ Run `npm run test:e2e:report` and check screenshots

**Need Help?**
→ Check [Playwright docs](https://playwright.dev)

---

**Happy Testing!** 🎭

