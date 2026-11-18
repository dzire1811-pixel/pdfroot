export type PublicReview = {
  id: string;
  rating: number;
  comment: string;
  date: string;
};

export type ToolReviews = {
  ratings: number;
  average: number;
  written: number;
  reviews: PublicReview[];
  next: string | null;
};
