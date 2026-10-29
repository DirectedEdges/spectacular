/**
 * Specs Schema Types
 *
 * TypeScript type definitions matching the Specs JSON schema.
 * These types represent the serialized output format produced by
 * @directededges/specs-from-figma and other Specs-compatible tools.
 */

// Core component types
export type { Component } from './Component.js';
export type {
  ComponentConcernDocument,
  ComponentApiDocument,
  ComponentVariantsDocument,
  ComponentExamplesDocument,
  ComponentApiSubcomponent,
  ComponentVariantsSubcomponent,
  ComponentExamplesSubcomponent,
} from './ComponentConcernDocument.js';
export type { Anatomy, AnatomyElement, AnatomyElementExtensions, FigmaAnatomyElementExtension, ElementTypeRef, SubcomponentRef, RoleConceptName, ElementRole, ActionConceptName, ActionEntry } from './Anatomy.js';
export type { ComponentName } from './ComponentName.js';
export type { Scalar } from './Scalar.js';
export type { Props, AnyProp, BooleanProp, StringProp, EnumProp, SlotProp, PrimitiveSlotContent, NumberProp, ObjectProp, ObjectPropMember, FigmaCodeOnlySource, FigmaPropExtension, PropExtensions } from './Props.js';
export type { Variant, Variants } from './Variant.js';
export type { Metadata, RunMetadata, Concern } from './Metadata.js';
export type { Subcomponent, Subcomponents, SubcomponentSource } from './Subcomponent.js';
export type { InstanceExample, InstanceExamples, InstanceExampleConfigurationValue } from './InstanceExample.js';

// Element and structure types
export type { Element, Elements, ElementType, ElementExtensions, FigmaElementExtension } from './Element.js';
export type { Layout, LayoutNode, LayoutBranch } from './Layout.js';
export type { Children, SlotBinding } from './Children.js';
export type { SlotContent, SlotContentMap } from './SlotContent.js';
export type { Composition, Compositions } from './Composition.js';
export type {
  CompositionConcernDocument,
  CompositionApiDocument,
  CompositionVariantsDocument,
  CompositionExamplesDocument,
} from './CompositionConcernDocument.js';

// Configuration types
export type { PropConfigurations, PropConfigurationValue, NestedPropConfiguration, ObjectPropValue } from './PropConfigurations.js';
export type {
  Conventions,
  ResolvedConventions,
  StorybookConventions,
  MetadataConventions,
  PlatformConventions,
  ResolvedPlatformConventions,
  GlyphStructure,
  GlyphStructureNode,
  PrimitiveKind,
  PrimitiveEntry,
  PrimitiveRule,
  VariantStateEntry,
  SpecsConventions,
  PropReference,
  ValueConvention,
} from './Conventions.js';
export { DEFAULT_CONVENTIONS } from './Conventions.js';
export type { Settings, ResolvedSettings, ColorFormat, SourceEntry } from './Settings.js';
export { DEFAULT_SETTINGS } from './Settings.js';

// Style types
export type { Styles, ContentStyles, TextContentStyles, GlyphContentStyles, Style, ColorStyle, ColorObject, StyleKey, TokenReference, AspectRatioValue, AspectRatioStyle, Typography, Sides, Corners, ItemSpacing, LayoutMode, WrapAlignment, MainAxisAlignment, CrossAxisAlignment, Position, PositionOffset, StrokeDashPattern, TextAlignHorizontal, TextOverflow } from './Styles.js';
export type { Shadow, Blur, Effects } from './Effects.js';
export type { GradientStop, GradientCenter, LinearGradient, RadialGradient, AngularGradient, GradientValue } from './Gradient.js';

// Image types
export type { ObjectFit, ImageValue, FigmaImageExtension, ImageDataExtensions, ImageData, Images, ImageProp, ImageBinding } from './Image.js';

// Reference types
export type { PropBinding, BindingKey } from './PropBinding.js';
export type { SlotContentRef } from './SlotContentRef.js';

// Conditional types
export type { Conditional, ConditionExpression, ConditionArgs } from './Conditional.js';
