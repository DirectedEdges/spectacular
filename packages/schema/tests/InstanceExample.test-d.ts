/**
 * Type-level tests for InstanceExample (ADR-048, ADR-124).
 * These files are intentionally never executed — they are compiled with tsc
 * to assert that the type shape is correct.
 */
import type { InstanceExample, InstanceExamples } from '../types/index.js';

// Minimal example — every property is optional
const bare: InstanceExample = {};

// Title and scalar configurations
const configured: InstanceExample = {
  title: 'Primary, disabled',
  propConfigurations: { variant: 'primary', isDisabled: true, label: null },
};

// Slot props via SlotContentRef
const withSlot: InstanceExample = {
  propConfigurations: {
    children: { $slotContent: '#/components/card/slotContentExamples/card1__children' },
  },
};

// ADR-124: the example instance's own box
const sized: InstanceExample = {
  title: 'Card 5',
  styles: { layoutSizingHorizontal: 'FIXED', width: 354 },
};

// styles is a full Styles value — other keys are admitted
const styled: InstanceExample = {
  styles: { layoutSizingHorizontal: 'FIXED', width: 354, layoutSizingVertical: 'HUG' },
};

// @ts-expect-error — styles must be a Styles object, not a number
const invalidStyles: InstanceExample = { styles: 354 };

// Keyed record
const examples: InstanceExamples = { card5: sized, bare };
