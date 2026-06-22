export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  date: string;
  readTime: string;
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

export const blogPosts: BlogPost[] = [
  {
    slug: "resize-image-exact-kb-government-forms",
    title: "How to Resize Image to Exact KB for Government Forms",
    description: "Prepare photos and signatures for online applications by resizing images to exact KB limits without complicated software.",
    category: "Image Tools",
    date: "June 22, 2026",
    readTime: "4 min read",
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
