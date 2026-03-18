export interface RecipeCategory {
  id: string;
  name: string;
  department: string;
  order_index: number;
  created_at: string;
}

export interface RecipeItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  is_published: boolean;
  order_index: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  recipe_categories?: RecipeCategory;
}

export interface RecipeStep {
  id: string;
  recipe_id: string;
  step_number: number;
  title: string | null;
  content: string;
  image_url: string | null;
  created_at: string;
}
