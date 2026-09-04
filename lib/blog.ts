import { cropImageBlogReadTime } from "@/lib/cropImageBlog";

export type BlogPost = {
  slug: string;
  title: string;
  listingTitle?: string;
  description: string;
  listingDescription?: string;
  category: string;
  date: string;
  readTime: string;
  seoTitle?: string;
  canonicalUrl?: string;
  author?: string;
  authorTitle?: string;
  publishedAt?: string;
  modifiedAt?: string;
  image?: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
  };
  relatedTool?: {
    label: string;
    href: string;
  };
  content: {
    intro: string;
    sections: {
      heading: string;
      body: string;
    }[];
  };
};

export const resizeImageExactKbFaq = [
  {
    question: "What does KB mean in an image?",
    answer: "KB stands for kilobytes. It represents the storage size of an image file. A form asking for a 50 KB image is referring to the file size, not necessarily its width or height.",
  },
  {
    question: "Can I resize an image to 20 KB or 50 KB?",
    answer: "Yes. Enter the required target size in the PDFRoot tool, process the image, and preview the final result before downloading it.",
  },
  {
    question: "Can I use this tool on a mobile phone?",
    answer: "Yes. The tool is designed to work on both mobile phones and desktop computers.",
  },
  {
    question: "Is image file size the same as image dimensions?",
    answer: "No. File size is measured in KB or MB, while image dimensions are measured in pixels, such as 200 × 230 pixels. Some forms specify both requirements.",
  },
  {
    question: "Will resizing reduce image quality?",
    answer: "Reducing an image’s file size may affect its quality. Always preview the processed image and make sure the photograph, signature, or document remains clear and readable.",
  },
  {
    question: "Can I resize JPG and PNG images?",
    answer: "Yes. The tool currently supports JPG, JPEG, PNG, and WebP images.",
  },
  {
    question: "Should I check the official recruitment notification?",
    answer: "Yes. Always follow the official notification or application instructions because every examination, recruitment, admission, or scholarship form may have different image requirements.",
  },
  {
    question: "Why is my image not being accepted after resizing?",
    answer: "The form may also require a specific image format, width, height, background, or minimum and maximum file-size range. Check every requirement mentioned on the official form.",
  },
] as const;

export const blogPosts: BlogPost[] = [
  {
    slug: "ojas-photo-resize-student-problem",
    title: "How the OJAS Photo Resize Tool Was Created to Solve a Real Student Problem",
    seoTitle: "OJAS Photo Resize Tool – Solving a Real Student Problem | PDFRoot",
    description: "Learn why PDFRoot created the OJAS Photo Resize Tool after discovering that many Gujarat government job candidates struggle to resize photos and signatures for OJAS recruitment forms.",
    category: "Government Forms",
    date: "September 4, 2026",
    readTime: "5 min read",
    canonicalUrl: "https://www.pdfroot.com/blog/ojas-photo-resize-student-problem",
    author: "Anand Joshi",
    authorTitle: "Founder of PDFRoot",
    publishedAt: "2026-09-04",
    modifiedAt: "2026-09-04",
    image: {
      src: "/blog/ojas-photo-signature-15kb-requirement.png",
      alt: "OJAS Gujarat photo and signature upload requirements showing maximum 15 KB file size",
      width: 780,
      height: 496,
    },
    relatedTool: { label: "Resize OJAS Photo", href: "/ojas-photo-resize" },
    content: {
      intro: "In Gujarat, many government recruitment applications are submitted through the OJAS (Online Job Application System) website.",
      sections: [],
    },
  },
  {
    slug: "pdfroot-smart-crop-image-tool",
    title: "PDFRoot Crop Image Tool: A Smart Solution for Online Form Photos and Documents",
    listingTitle: "PDFRoot Crop Image Tool – A Smart Solution for Online Form Photos and Documents",
    seoTitle: "Smart Crop Image Tool for Online Forms | PDFRoot",
    description: "Crop multiple photos, signatures and documents from one A4 page. Set dimensions, KB, rotate, flip, rename and save images with PDFRoot.",
    listingDescription: "Crop multiple photos, signatures and documents from one A4 page without uploading the same file repeatedly. Set dimensions, KB, rotate, flip, rename and save images easily.",
    category: "Image Tools",
    date: "25 July 2026",
    readTime: cropImageBlogReadTime,
    canonicalUrl: "https://www.pdfroot.com/blog/pdfroot-smart-crop-image-tool",
    author: "Anand Joshi",
    authorTitle: "Founder of PDFRoot",
    publishedAt: "2026-07-25",
    modifiedAt: "2026-07-25",
    image: {
      src: "/blog/pdfroot-crop-image-tool-a4-document.webp",
      alt: "PDFRoot Crop Image Tool showing an A4 document ready for cropping and image preparation",
      width: 1724,
      height: 816,
    },
    relatedTool: {
      label: "Try Crop Image Tool",
      href: "/crop-image",
    },
    content: {
      intro: "Crop multiple photos, signatures and documents from one A4 page without uploading the same file repeatedly.",
      sections: [],
    },
  },
  {
    slug: "resize-image-to-exact-kb",
    title: "Resize Image to Exact KB – A Useful Tool for Students and Job Applicants",
    seoTitle: "Resize Image to Exact KB Online for Forms | PDFRoot",
    description: "Resize JPG, JPEG or PNG images to 20 KB, 50 KB, 100 KB, 200 KB or a custom size for government, exam and job application forms.",
    category: "Image Tools",
    date: "July 2026",
    readTime: "9 min read",
    canonicalUrl: "https://www.pdfroot.com/blog/resize-image-to-exact-kb",
    image: {
      src: "/blog/resize-image-to-exact-kb-online-pdfroot.webp",
      alt: "PDFRoot Resize Image to Exact KB tool for online application forms",
    },
    relatedTool: {
      label: "Resize Your Image to Exact KB Now",
      href: "/resize-image-to-exact-kb",
    },
    content: {
      intro: "PDFRoot’s Resize Image to Exact KB tool helps students and job applicants prepare photographs, signatures, and document images for online forms.",
      sections: [],
    },
  },
  {
    slug: "resize-image-exact-kb-government-forms",
    title: "How to Resize Image to Exact KB for Government Forms",
    description: "Prepare photos and signatures for online applications by resizing images to exact KB limits without complicated software.",
    category: "Image Tools",
    date: "June 22, 2026",
    readTime: "4 min read",
    image: {
      src: "/blog/government-form-photo-signature-resize-guide.webp",
      alt: "Government form photo and signature resizing guide",
    },
    relatedTool: {
      label: "Resize Image to Exact KB",
      href: "/resize-image-to-exact-kb",
    },
    content: {
      intro:
        "Government forms often require strict image file sizes such as 20KB, 50KB, or 100KB. PDFRoot helps you resize a photo or signature to an exact KB target while keeping the workflow simple.",
      sections: [
        {
          heading: "Check the Required File Size",
          body:
            "Before uploading, confirm the portal requirement for photo size, signature size, accepted format, and dimensions. This prevents repeated form upload errors.",
        },
        {
          heading: "Upload and Set the Target KB",
          body:
            "Open the exact KB resize tool, upload your JPG, PNG, or WEBP image, enter the target size, and let the tool optimize the file in your browser.",
        },
        {
          heading: "Preview Before Final Upload",
          body:
            "After resizing, download the file and confirm the image is clear enough for identity verification before submitting it to the form portal.",
        },
      ],
    },
  },
  {
    slug: "jpg-to-pdf-online-complete-guide",
    title: "JPG to PDF Online: Complete Guide",
    description: "Learn how to combine JPG images into a clean PDF for forms, assignments, office documents, and sharing.",
    category: "PDF Conversion",
    date: "June 22, 2026",
    readTime: "3 min read",
    relatedTool: {
      label: "JPG to PDF Tool",
      href: "/jpg-to-pdf",
    },
    content: {
      intro:
        "Converting JPG images to PDF is useful when you need to submit multiple photos, scanned pages, receipts, or documents as one file.",
      sections: [
        {
          heading: "Upload Your Images",
          body:
            "Select one or more JPG, JPEG, or PNG files. If you have multiple pages, arrange them in the order you want them to appear in the PDF.",
        },
        {
          heading: "Create a Single PDF",
          body:
            "PDFRoot turns your selected images into one PDF document, making it easier to upload, email, print, or store.",
        },
        {
          heading: "Use Clear Source Images",
          body:
            "For best results, upload sharp images with readable text and avoid unnecessary borders or dark shadows around scanned documents.",
        },
      ],
    },
  },
  {
    slug: "compress-pdf-without-losing-quality",
    title: "How to Compress PDF Without Losing Quality",
    description: "Reduce PDF file size for email, portals, and sharing while keeping pages readable and professional.",
    category: "PDF Compression",
    date: "June 22, 2026",
    readTime: "4 min read",
    relatedTool: {
      label: "Compress PDF",
      href: "/compress-pdf",
    },
    content: {
      intro:
        "A PDF may be too large because of images, scanned pages, or embedded content. Compressing it can make uploads faster while preserving readability.",
      sections: [
        {
          heading: "Start With the Right Compression Level",
          body:
            "Choose a balanced compression level when quality matters. Use stronger compression only when a portal has a strict file size limit.",
        },
        {
          heading: "Review the Output File",
          body:
            "After compression, open the PDF and check important pages, signatures, stamps, and small text before submitting it.",
        },
        {
          heading: "Keep the Original Copy",
          body:
            "Save your original PDF separately so you can try a different compression setting if the compressed file becomes too small or unclear.",
        },
      ],
    },
  },
  {
    slug: "best-pdf-tools-students-professionals",
    title: "Best PDF Tools for Students and Professionals",
    description: "A practical list of PDF and image tools for assignments, applications, office tasks, and everyday document work.",
    category: "Productivity",
    date: "June 22, 2026",
    readTime: "5 min read",
    relatedTool: {
      label: "Browse All Tools",
      href: "/tools",
    },
    content: {
      intro:
        "Students and professionals often need fast document tools for converting, compressing, merging, splitting, and resizing files.",
      sections: [
        {
          heading: "Conversion Tools",
          body:
            "JPG to PDF, PDF to JPG, Word to PDF, and PDF to Word help move documents between formats used by schools, offices, and online portals.",
        },
        {
          heading: "Compression and Resize Tools",
          body:
            "Compress PDF and exact KB image resize tools are useful when email attachments or application portals have file size limits.",
        },
        {
          heading: "Organization Tools",
          body:
            "Merge, split, rotate, crop, and organize PDF tools make it easier to prepare clean final documents without installing heavy desktop software.",
        },
      ],
    },
  },
  {
    slug: "ssc-ojas-ibps-photo-resize-guide",
    title: "SSC, OJAS, IBPS Photo Resize Guide",
    description: "Resize photos and signatures for popular exam and recruitment forms with the right file size and format.",
    category: "Government Forms",
    date: "June 22, 2026",
    readTime: "4 min read",
    relatedTool: {
      label: "Government Photo Tools",
      href: "/#gov-tools",
    },
    content: {
      intro:
        "Recruitment and exam portals commonly reject photos or signatures when file size, format, or dimensions do not match the instructions.",
      sections: [
        {
          heading: "Read the Portal Instructions",
          body:
            "Check whether the form asks for a photo, signature, thumb impression, or document scan, then note the file size and format requirements.",
        },
        {
          heading: "Use the Matching Resize Tool",
          body:
            "PDFRoot includes focused tools for SSC, OJAS, IBPS, RRB, UPSC, GPSC, signatures, passport photos, and exact KB image resizing.",
        },
        {
          heading: "Download and Upload Carefully",
          body:
            "After resizing, save the final file with a clear name and upload it to the correct field on the application form.",
        },
      ],
    },
  },
];

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug);
}
