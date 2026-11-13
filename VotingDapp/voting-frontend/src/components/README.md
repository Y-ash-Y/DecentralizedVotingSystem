# Shared presentation components

[presentation.jsx](presentation.jsx) contains reusable interface elements used
by the application. Keep presentation concerns here; commitment generation,
chain reads and receipt validation belong in [lib/](../lib/README.md).

Hiding or disabling a control is not authorization. Contract rules must reject
the same invalid operation regardless of whether it is submitted through this
interface. Layout/accessibility behavior is exercised by the
[UI tests](../../test-ui/README.md) and [browser smoke tests](../../test-browser/README.md).
