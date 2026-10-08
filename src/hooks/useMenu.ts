import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { CategoryWithProducts, ProductVariant } from '../types';

const RESTAURANT_ID = '0c3f2f1a-03d9-46d3-9410-17384e3b896d';

interface UseMenuResult {
  restaurantName: string | null;
  categories: CategoryWithProducts[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useMenu(): UseMenuResult {
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // Load restaurant, categories, and products in parallel using Promise.all()
        const [
          { data: restaurant, error: rErr },
          { data: cats, error: cErr },
          { data: prods, error: pErr },
        ] = await Promise.all([
          supabase
            .from('restaurants')
            .select('id, name, is_active')
            .eq('id', RESTAURANT_ID)
            .single(),
          supabase
            .from('categories')
            .select('id, restaurant_id, name, sort_order, is_active')
            .eq('restaurant_id', RESTAURANT_ID)
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
          supabase
            .from('products')
            .select('id, restaurant_id, category_id, name, description, sort_order, is_available')
            .eq('restaurant_id', RESTAURANT_ID)
            .eq('is_available', true)
            .order('sort_order', { ascending: true }),
        ]);

        if (rErr) throw rErr;
        if (!restaurant?.is_active) throw new Error('المطعم غير متاح حالياً');
        if (cErr) throw cErr;
        if (pErr) throw pErr;

        if (!cats?.length) {
          if (!cancelled) {
            setRestaurantName(restaurant.name);
            setCategories([]);
            setLoading(false);
          }
          return;
        }

        // Load available variants for the fetched products
        const productIds = (prods ?? []).map((p) => p.id);
        let variants: ProductVariant[] = [];

        if (productIds.length > 0) {
          const { data: vars, error: vErr } = await supabase
            .from('product_variants')
            .select('id, product_id, name, price, sort_order, is_available')
            .in('product_id', productIds)
            .eq('is_available', true)
            .order('sort_order', { ascending: true });

          if (vErr) throw vErr;
          variants = vars ?? [];
        }

        // 5. Assemble the hierarchy
        const variantsByProduct = new Map<string, typeof variants>();
        for (const v of variants) {
          const arr = variantsByProduct.get(v.product_id) ?? [];
          arr.push(v);
          variantsByProduct.set(v.product_id, arr);
        }

        const productsByCategory = new Map<string, typeof prods>();
        for (const p of prods ?? []) {
          const arr = productsByCategory.get(p.category_id) ?? [];
          arr.push(p);
          productsByCategory.set(p.category_id, arr);
        }

        const enriched = cats.map((cat) => ({
          ...cat,
          products: (productsByCategory.get(cat.id) ?? []).map((prod) => ({
            ...prod,
            variants: variantsByProduct.get(prod.id) ?? [],
          })),
        }));

        if (!cancelled) {
          setRestaurantName(restaurant.name);
          setCategories(enriched);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('حدث خطأ أثناء تحميل القائمة.');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick]);

  return {
    restaurantName,
    categories,
    loading,
    error,
    retry: () => setTick((t) => t + 1),
  };
}
