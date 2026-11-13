<script setup lang="ts">
import { t as uiText } from "@/i18n";
import LegalArticle, { type LegalSection, type LegalEntityRow } from "@/components/LegalArticle.vue";

const entity: LegalEntityRow[] = [
  { k: "服务提供方", v: "上海奏星人工智能科技有限责任公司" },
  { k: "服务名称", v: "画匣子 PHOTOLIO" },
  { k: "ICP 备案号", v: "沪ICP备2025153256号-2" },
];

const intro = [
  "欢迎使用画匣子（PHOTOLIO）提供的服务。本服务由上海奏星人工智能科技有限责任公司提供并运营。使用我们的服务即表示您同意以下条款。",
];

const sections: LegalSection[] = [
  {
    title: "一、服务内容",
    paragraphs: [
      "画匣子提供多人共创回忆录的在线平台服务，包括但不限于：照片和文字的上传与整合、回忆录的自动排版与生成、实体纪念册的印制与 NFC 功能嵌入。",
    ],
  },
  {
    title: "二、用户责任",
    list: [
      "您应确保上传的内容不侵犯他人的肖像权、著作权等合法权益",
      "多人共创时，您应确保已获得其他参与者的知情同意",
      "您不得上传违反法律法规或公序良俗的内容",
    ],
  },
  {
    title: "三、知识产权",
    paragraphs: [
      "您上传的原始内容（照片、文字）的知识产权归您所有。画匣子生成的排版设计的知识产权归画匣子所有，但您享有永久的、非排他性的使用权。",
    ],
  },
  {
    title: "四、服务费用",
    paragraphs: [
      "在线回忆录生成功能免费使用。实体纪念册印制、NFC 嵌入等增值服务按照具体方案收费，具体价格以双方确认的订单为准。",
    ],
  },
  {
    title: "五、免责声明",
    paragraphs: [
      "因不可抗力、第三方服务中断等非我们原因导致的服务中断或数据丢失，我们不承担赔偿责任，但会尽最大努力协助恢复。",
    ],
  },
  {
    title: "六、争议解决",
    paragraphs: [
      "本协议适用中华人民共和国法律。如发生争议，双方应友好协商解决。",
    ],
  },
  {
    title: "七、联系方式",
    paragraphs: [
      "如有疑问，请通过页面上的联系方式与我们取得联系。",
      "服务提供方：上海奏星人工智能科技有限责任公司",
      "统一社会信用代码：91310104MAG2695N58",
      "注册地址：上海市徐汇区古美路 1528 号 6 幢 9 层 904 室",
      "ICP 备案号：沪ICP备2025153256号-2（可在工信部备案系统 beian.miit.gov.cn 查询核实）",
    ],
  },
];
</script>

<template>
  <LegalArticle
    :title='uiText("用户服务协议")'
    updated="2026 年 8 月"
    :entity="entity"
    :intro="intro"
    :sections="sections"
  />
</template>
