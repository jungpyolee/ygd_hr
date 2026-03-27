"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface KurlyProduct {
  id: string;
  name: string;
  master_code: string;
  barcode: string | null;
  unit_weight: string | null;
  box_capacity: number;
  is_active: boolean;
  created_at: string;
}

export default function AdminKurlyProductsPage() {
  const [products, setProducts] = useState<KurlyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KurlyProduct | null>(null);

  const [newProduct, setNewProduct] = useState({
    name: "",
    master_code: "",
    barcode: "",
    unit_weight: "",
    box_capacity: "",
  });

  const [editProduct, setEditProduct] = useState({
    name: "",
    master_code: "",
    barcode: "",
    unit_weight: "",
    box_capacity: "",
  });

  const supabase = createClient();
  const router = useRouter();

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("kurly_products")
      .select("*")
      .order("created_at", { ascending: true });
    setProducts(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const addProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.master_code.trim()) {
      toast.error("필수 항목을 입력해주세요", {
        description: "상품명과 마스터코드는 반드시 필요해요",
      });
      return;
    }
    const capacity = parseInt(newProduct.box_capacity) || 1;
    const { error } = await supabase.from("kurly_products").insert({
      name: newProduct.name.trim(),
      master_code: newProduct.master_code.trim(),
      barcode: newProduct.barcode.trim() || null,
      unit_weight: newProduct.unit_weight.trim() || null,
      box_capacity: capacity,
    });
    if (error) {
      toast.error("제품을 추가할 수 없어요", {
        description: error.message.includes("unique")
          ? "이미 등록된 마스터코드예요"
          : "잠시 후 다시 시도해주세요",
      });
      return;
    }
    toast.success("제품을 추가했어요");
    setNewProduct({
      name: "",
      master_code: "",
      barcode: "",
      unit_weight: "",
      box_capacity: "",
    });
    setShowAddForm(false);
    fetchProducts();
  };

  const startEdit = (p: KurlyProduct) => {
    setEditingId(p.id);
    setEditProduct({
      name: p.name,
      master_code: p.master_code,
      barcode: p.barcode ?? "",
      unit_weight: p.unit_weight ?? "",
      box_capacity: String(p.box_capacity),
    });
  };

  const saveEdit = async () => {
    if (
      !editingId ||
      !editProduct.name.trim() ||
      !editProduct.master_code.trim()
    ) {
      toast.error("필수 항목을 입력해주세요", {
        description: "상품명과 마스터코드는 반드시 필요해요",
      });
      return;
    }
    const capacity = parseInt(editProduct.box_capacity) || 1;
    const { error } = await supabase
      .from("kurly_products")
      .update({
        name: editProduct.name.trim(),
        master_code: editProduct.master_code.trim(),
        barcode: editProduct.barcode.trim() || null,
        unit_weight: editProduct.unit_weight.trim() || null,
        box_capacity: capacity,
      })
      .eq("id", editingId);
    if (error) {
      toast.error("수정할 수 없어요", {
        description: "잠시 후 다시 시도해주세요",
      });
      return;
    }
    toast.success("제품 정보를 수정했어요");
    setEditingId(null);
    fetchProducts();
  };

  const deleteProduct = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("kurly_products")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error("삭제할 수 없어요", {
        description: "잠시 후 다시 시도해주세요",
      });
      setDeleteTarget(null);
      return;
    }
    toast.success("제품을 삭제했어요");
    setDeleteTarget(null);
    fetchProducts();
  };

  const InputField = ({
    value,
    onChange,
    placeholder,
    type = "text",
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    type?: string;
  }) => (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] focus:outline-none focus:border-[#3182F6] transition-all"
    />
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-36 bg-[#F2F4F6] animate-pulse rounded-xl" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-[28px] h-[72px] animate-pulse border border-slate-100"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <header>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/admin/orders")}
            aria-label="뒤로가기"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] active:bg-[#E5E8EB] transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-[#191F28]" />
          </button>
          <h1 className="text-2xl font-bold text-[#191F28] tracking-tight">
            컬리 제품 관리
          </h1>
        </div>
        <p className="text-[14px] text-[#8B95A1] font-medium mt-1 ml-11">
          거래명세서 업로드 시 자동으로 매칭돼요
        </p>
      </header>

      {/* 제품 목록 */}
      <div className="bg-white rounded-[28px] border border-slate-100 overflow-hidden">
        {products.length === 0 ? (
          <div className="py-12 text-center text-[14px] text-[#8B95A1]">
            아직 등록된 제품이 없어요
          </div>
        ) : (
          <div className="divide-y divide-[#F2F4F6]">
            {products.map((p) => (
              <div key={p.id}>
                {editingId === p.id ? (
                  /* 수정 모드 */
                  <div className="p-4 space-y-2.5 bg-[#F9FAFB]">
                    <InputField
                      value={editProduct.name}
                      onChange={(v) =>
                        setEditProduct({ ...editProduct, name: v })
                      }
                      placeholder="상품명을 입력해주세요"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <InputField
                        value={editProduct.master_code}
                        onChange={(v) =>
                          setEditProduct({ ...editProduct, master_code: v })
                        }
                        placeholder="마스터코드"
                      />
                      <InputField
                        value={editProduct.barcode}
                        onChange={(v) =>
                          setEditProduct({ ...editProduct, barcode: v })
                        }
                        placeholder="바코드 (선택)"
                      />
                      <InputField
                        value={editProduct.unit_weight}
                        onChange={(v) =>
                          setEditProduct({ ...editProduct, unit_weight: v })
                        }
                        placeholder="규격 (예: 170g)"
                      />
                      <InputField
                        value={editProduct.box_capacity}
                        onChange={(v) =>
                          setEditProduct({ ...editProduct, box_capacity: v })
                        }
                        placeholder="박스당 입수량"
                        type="number"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-4 py-2 rounded-xl text-[13px] font-bold text-[#4E5968] bg-[#F2F4F6] hover:bg-[#E5E8EB] transition-colors"
                      >
                        취소
                      </button>
                      <button
                        onClick={saveEdit}
                        className="px-4 py-2 rounded-xl text-[13px] font-bold text-white bg-[#3182F6] hover:bg-[#2272EB] transition-colors"
                      >
                        저장하기
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 보기 모드 */
                  <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F9FAFB] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-[#191F28] truncate">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-[#8B95A1] mt-0.5">
                        {p.master_code} · {p.box_capacity}개입
                        {p.unit_weight ? ` · ${p.unit_weight}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => startEdit(p)}
                      aria-label="수정"
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[#8B95A1]" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      aria-label="삭제"
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#FFF0F0] transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[#F04438]" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 제품 추가 */}
      {showAddForm ? (
        <div className="bg-white rounded-[28px] border border-slate-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-[#191F28]">
              새 제품 등록하기
            </h3>
            <button
              onClick={() => setShowAddForm(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F2F4F6] text-[#8B95A1] hover:bg-[#E5E8EB] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <InputField
            value={newProduct.name}
            onChange={(v) => setNewProduct({ ...newProduct, name: v })}
            placeholder="상품명 (예: [연경당] 금귤정과 140g)"
          />
          <div className="grid grid-cols-2 gap-2">
            <InputField
              value={newProduct.master_code}
              onChange={(v) =>
                setNewProduct({ ...newProduct, master_code: v })
              }
              placeholder="마스터코드 (필수)"
            />
            <InputField
              value={newProduct.barcode}
              onChange={(v) => setNewProduct({ ...newProduct, barcode: v })}
              placeholder="바코드 (선택)"
            />
            <InputField
              value={newProduct.unit_weight}
              onChange={(v) =>
                setNewProduct({ ...newProduct, unit_weight: v })
              }
              placeholder="규격 (예: 170g)"
            />
            <InputField
              value={newProduct.box_capacity}
              onChange={(v) =>
                setNewProduct({ ...newProduct, box_capacity: v })
              }
              placeholder="박스당 입수량"
              type="number"
            />
          </div>
          <button
            onClick={addProduct}
            className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white bg-[#3182F6] hover:bg-[#2272EB] active:bg-[#1B64DA] transition-colors"
          >
            등록하기
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-3.5 rounded-[28px] border-2 border-dashed border-[#E5E8EB] text-[13px] font-bold text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6] hover:bg-[#F8FBFF] active:bg-[#E8F3FF] transition-all flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          제품 추가하기
        </button>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={`"${deleteTarget?.name}"을 삭제할까요?`}
        description="삭제하면 이 제품은 발주 시 선택할 수 없어요."
        confirmLabel="삭제할게요"
        cancelLabel="취소"
        variant="destructive"
        onConfirm={deleteProduct}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
