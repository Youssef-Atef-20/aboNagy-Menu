import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { CategoryWithProducts } from '../types';

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
        // 1. Load restaurant
        const { data: restaurant, error: rErr } = await supabase
          .from('restaurants')
          .select('id, name, is_active')
          .eq('id', RESTAURANT_ID)
          .single();

        if (rErr) throw rErr;
        if (!restaurant?.is_active) throw new Error('المطعم غير متاح حالياً');

        // 2. Load active categories
        const { data: cats, error: cErr } = await supabase
          .from('categories')
          .select('id, restaurant_id, name, sort_order, is_active')
          .eq('restaurant_id', RESTAURANT_ID)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (cErr) throw cErr;
        if (!cats?.length) {
          if (!cancelled) {
            setRestaurantName(restaurant.name);
            setCategories([]);
            setLoading(false);
          }
          return;
        }

        // 3. Load available products
        const { data: prods, error: pErr } = await supabase
          .from('products')
          .select('id, restaurant_id, category_id, name, description, sort_order, is_available')
          .eq('restaurant_id', RESTAURANT_ID)
          .eq('is_available', true)
          .order('sort_order', { ascending: true });

        if (pErr) throw pErr;

        // 4. Load available variants
        const productIds = (prods ?? []).map((p) => p.id);
        let variants: { id: string; product_id: string; name: string; price: number; sort_order: number; is_available: boolean }[] = [];

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
      } catch (err) {
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
