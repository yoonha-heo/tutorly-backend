export type ReceivedReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  booking: {
    id: string;
    lessonStartAt: Date;
    lessonEndAt: Date;
    student: {
      id: string;
      name: string | null;
      profileImage: string | null;
    };
  };
};

export type WrittenReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  booking: {
    id: string;
    lessonStartAt: Date;
    lessonEndAt: Date;
    teacher: {
      id: string;
      headline: string | null;
      profileImageUrl: string | null;
      user: {
        id: string;
        name: string | null;
      };
    };
  };
};

export type ReviewListResponse<TItem> = {
  items: TItem[];
  page: number;
  limit: number;
  totalCount: number;
  hasNextPage: boolean;
  nextPage: number | null;
};
