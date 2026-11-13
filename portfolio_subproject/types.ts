export type ImageFit = 'cover' | 'top' | 'contain' | 'fill' | 'repeat' | 'border'
export type Layout = 'grid' | 'vertical' | 'horizontal' | 'masonry'
export interface ContentRef { source: 'share' | 'group' | 'preset'; id: string; part: string; key: string }
export interface ContentItem {
  id?: string; source?: ContentRef['source']; title: string; type: string; cover?: string
  url?: string; href?: string; text?: string; public?: boolean; archived?: boolean
  expandable?: boolean; ref?: ContentRef
}
export interface SpaceBlock {
  id: string; title: string; kind: 'empty' | 'text' | 'reference' | 'url'; span: number
  display: 'embed' | 'link'; text?: string; url?: string; media_type?: string
  cover_url?: string; cover_ref?: ContentRef; image_fit?: ImageFit; autoplay?: boolean
  ref?: ContentRef; resolved?: ContentItem
}
export interface SpaceSection { id: string; title: string; layout: Layout; fixed_size?: boolean; aspect_ratio?: '1:1' | '4:3' | '16:9'; blocks: SpaceBlock[] }
export interface PersonalSpace {
  space_id: string; title: string; template_id: string; template_version: number
  revision: number; sections: SpaceSection[]; can_edit: boolean; is_template?: boolean
}
export interface SpaceSummary { space_id: string; title: string; revision: number }
export const LAYOUTS: Array<{ value: Layout; label: string }> = [
  { value: 'grid', label: '规则网格' }, { value: 'vertical', label: '纵向单列' },
  { value: 'horizontal', label: '横向浏览' }, { value: 'masonry', label: '双列瀑布流' },
]

export const IMAGE_FITS: Array<{ value: ImageFit; label: string }> = [
  { value: 'cover', label: '铺满裁剪' }, { value: 'top', label: '左右对齐，顶部显示' },
  { value: 'contain', label: '完整显示' }, { value: 'fill', label: '拉伸填充' },
  { value: 'repeat', label: '重复平铺' }, { value: 'border', label: '保留边框与留白' },
]
