import React from 'react';
import { FileText, Palette } from 'lucide-react';
import { LinkListInput } from '../ui/LinkListInput';

export const CONTENT_TYPE_PRESETS = [
  'Blog Post',
  'Website Copy',
  'Case Study',
  'Whitepaper',
  'Social Media Pack',
  'Email Newsletter',
  'Video Script',
  'Press Release',
];

export const DESIGN_ASSET_PRESETS = [
  'Social Media Banner',
  'Infographic',
  'Presentation Deck',
  'Brand Identity / Logo',
  'Ad Creative Pack',
  'Print / Packaging',
  'Vector Illustration',
];

interface ContentSpecFieldsProps {
  idPrefix: string;
  contentType: string;
  onChangeContentType: (val: string) => void;
  contentSpecifications: string;
  onChangeContentSpecifications: (val: string) => void;
  sourceContentReferences: string[];
  onChangeSourceContentReferences: (links: string[]) => void;
  readOnly?: boolean;
}

export const ContentSpecFields: React.FC<ContentSpecFieldsProps> = ({
  idPrefix,
  contentType,
  onChangeContentType,
  contentSpecifications,
  onChangeContentSpecifications,
  sourceContentReferences,
  onChangeSourceContentReferences,
  readOnly = false,
}) => (
  <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] overflow-hidden">
    <div className="flex items-center gap-2 px-3.5 py-2 border-b border-[var(--border-subtle)] text-[11px] font-bold text-[#1d4ed8] dark:text-blue-400 uppercase tracking-wider">
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span>Content Subtask Specifications</span>
    </div>

    <div className="p-3.5 space-y-3">
      <div>
        <label className="field-label" htmlFor={`${idPrefix}-content-type`}>
          Content Type
        </label>
        <input
          id={`${idPrefix}-content-type`}
          type="text"
          list={`${idPrefix}-content-type-options`}
          value={contentType}
          readOnly={readOnly}
          onChange={e => onChangeContentType(e.target.value)}
          placeholder="e.g. Blog Post, Website Copy, Case Study"
          className="field-control"
        />
        <datalist id={`${idPrefix}-content-type-options`}>
          {CONTENT_TYPE_PRESETS.map(opt => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-content-specs`}>
          Content Specifications
        </label>
        <textarea
          id={`${idPrefix}-content-specs`}
          rows={4}
          value={contentSpecifications}
          readOnly={readOnly}
          onChange={e => onChangeContentSpecifications(e.target.value)}
          placeholder="Word count, deliverable format, tone of voice, keywords, target persona, CTA..."
          className="field-control resize-y"
        />
      </div>

      <LinkListInput
        id={`${idPrefix}-content-refs`}
        label="Source Content & References"
        links={sourceContentReferences}
        onChange={onChangeSourceContentReferences}
        readOnly={readOnly}
        placeholder="Paste source doc, outline, or reference URL (https://...)"
        accent="blue"
      />
    </div>
  </div>
);

interface DesignSpecFieldsProps {
  idPrefix: string;
  assetType: string;
  onChangeAssetType: (val: string) => void;
  designSpecifications: string;
  onChangeDesignSpecifications: (val: string) => void;
  brandAssetsReferences: string[];
  onChangeBrandAssetsReferences: (links: string[]) => void;
  readOnly?: boolean;
}

export const DesignSpecFields: React.FC<DesignSpecFieldsProps> = ({
  idPrefix,
  assetType,
  onChangeAssetType,
  designSpecifications,
  onChangeDesignSpecifications,
  brandAssetsReferences,
  onChangeBrandAssetsReferences,
  readOnly = false,
}) => (
  <div className="rounded-[7px] border border-[var(--border)] bg-[var(--surface-muted)] overflow-hidden">
    <div className="flex items-center gap-2 px-3.5 py-2 border-b border-[var(--border-subtle)] text-[11px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
      <Palette className="h-3.5 w-3.5 shrink-0" />
      <span>Design Subtask Specifications</span>
    </div>

    <div className="p-3.5 space-y-3">
      <div>
        <label className="field-label" htmlFor={`${idPrefix}-asset-type`}>
          Asset Type
        </label>
        <input
          id={`${idPrefix}-asset-type`}
          type="text"
          list={`${idPrefix}-design-asset-options`}
          value={assetType}
          readOnly={readOnly}
          onChange={e => onChangeAssetType(e.target.value)}
          placeholder="e.g. Social Banner, Infographic"
          className="field-control"
        />
        <datalist id={`${idPrefix}-design-asset-options`}>
          {DESIGN_ASSET_PRESETS.map(opt => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      </div>

      <div>
        <label className="field-label" htmlFor={`${idPrefix}-design-specs`}>
          Design Specifications
        </label>
        <textarea
          id={`${idPrefix}-design-specs`}
          rows={4}
          value={designSpecifications}
          readOnly={readOnly}
          onChange={e => onChangeDesignSpecifications(e.target.value)}
          placeholder="Dimensions, aspect ratios, deliverable formats, quantity, visual notes, bleed/margins..."
          className="field-control resize-y"
        />
      </div>

      <LinkListInput
        id={`${idPrefix}-design-refs`}
        label="Brand Assets & References"
        links={brandAssetsReferences}
        onChange={onChangeBrandAssetsReferences}
        readOnly={readOnly}
        placeholder="Paste Figma, Drive asset folder, or visual reference URL (https://...)"
        accent="indigo"
      />
    </div>
  </div>
);
