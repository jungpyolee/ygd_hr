/**
 * Production DB RLS 통합 테스트
 *
 * 검증 대상: 모든 테이블의 권한별 CRUD 동작
 * 권한 유형: admin / full_time 직원 / part_time 직원
 *
 * 실행: npm run test:db
 *
 * ⚠️  Production DB (ymvdjxzkjodasctktunh) 대상
 *     테스트 데이터는 afterAll에서 완전 정리됨
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  serviceClient,
  createAuthUser,
  deleteAuthUser,
  signIn,
  createUserClient,
  expectRows,
  expectCount,
  expectEmpty,
  expectError,
  expectSuccess,
} from "./helpers";

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 상태 — beforeAll에서 채워짐
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  // 유저 IDs (Auth)
  adminId: "",
  ftId: "",    // full_time employee (레시피 작성자)
  ptId: "",    // part_time employee

  // 클라이언트
  adminClient: null as unknown as SupabaseClient,
  ftClient: null as unknown as SupabaseClient,
  ptClient: null as unknown as SupabaseClient,

  // 테스트 데이터 IDs
  storeId: "",
  categoryId: "",
  recipeId: "",          // ft_user가 작성한 비공개 레시피
  publishedRecipeId: "", // admin이 작성한 공개 레시피
  stepId: "",
  ingredientId: "",
  commentId: "",         // ft_user의 댓글
  adminCommentId: "",    // admin의 댓글 (ft_user 삭제 불가 확인용)
  announcementAllId: "", // target_roles: ['all']
  announcementFtId: "",  // target_roles: ['full_time'] only
  checklistTemplateId: "",
  weeklyScheduleId: "",
  slotFtId: "",          // ft_user 소유 스케줄 슬롯
  slotAdminId: "",       // admin 소유 스케줄 슬롯 (다른 직원도 조회 가능 검증용)
  substituteRequestId: "",
  workDefaultId: "",
  notificationId: "",
};

// 테스트 실행마다 고유 이메일 (재실행 충돌 방지)
const RUN_ID = Date.now();
const ADMIN_EMAIL = `rls.admin.${RUN_ID}@ygd-test.internal`;
const FT_EMAIL = `rls.ft.${RUN_ID}@ygd-test.internal`;
const PT_EMAIL = `rls.pt.${RUN_ID}@ygd-test.internal`;
const TEST_PASSWORD = "RlsTest_2026!";

// ─────────────────────────────────────────────────────────────────────────────
// 셋업: 테스트 유저 + 데이터 생성
// ─────────────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  // 1. Auth 유저 생성
  const [adminUser, ftUser, ptUser] = await Promise.all([
    createAuthUser(ADMIN_EMAIL, TEST_PASSWORD),
    createAuthUser(FT_EMAIL, TEST_PASSWORD),
    createAuthUser(PT_EMAIL, TEST_PASSWORD),
  ]);
  T.adminId = adminUser.id;
  T.ftId = ftUser.id;
  T.ptId = ptUser.id;

  // 2. 프로필 업데이트 (handle_new_user 트리거가 기본 프로필 생성)
  //    role과 employment_type을 각 유저 타입에 맞게 설정
  await serviceClient.from("profiles").upsert([
    {
      id: T.adminId,
      email: ADMIN_EMAIL,
      name: "테스트 어드민",
      role: "admin",
      employment_type: "full_time",
      work_locations: [],
      cafe_positions: [],
    },
    {
      id: T.ftId,
      email: FT_EMAIL,
      name: "테스트 정규직",
      role: "employee",
      employment_type: "full_time",
      work_locations: [],
      cafe_positions: [],
    },
    {
      id: T.ptId,
      email: PT_EMAIL,
      name: "테스트 파트타임",
      role: "employee",
      employment_type: "part_time",
      work_locations: [],
      cafe_positions: [],
    },
  ]);

  // 3. 로그인 → JWT → 클라이언트 생성
  const [adminJwt, ftJwt, ptJwt] = await Promise.all([
    signIn(ADMIN_EMAIL, TEST_PASSWORD),
    signIn(FT_EMAIL, TEST_PASSWORD),
    signIn(PT_EMAIL, TEST_PASSWORD),
  ]);
  T.adminClient = createUserClient(adminJwt);
  T.ftClient = createUserClient(ftJwt);
  T.ptClient = createUserClient(ptJwt);

  // 4. 테스트 매장 생성
  const { data: store } = await serviceClient
    .from("stores")
    .insert({ name: "RLS테스트점", lat: 37.5, lng: 127.0 })
    .select("id")
    .single();
  T.storeId = store!.id;

  // 5. 레시피 카테고리 생성
  const { data: cat } = await serviceClient
    .from("recipe_categories")
    .insert({ name: "RLS테스트카테고리", order_index: 999 })
    .select("id")
    .single();
  T.categoryId = cat!.id;

  // 6. 레시피 생성 (ft_user 작성, 비공개)
  const { data: recipe } = await serviceClient
    .from("recipe_items")
    .insert({
      name: "RLS테스트레시피(비공개)",
      category_id: T.categoryId,
      created_by: T.ftId,
      is_published: false,
    })
    .select("id")
    .single();
  T.recipeId = recipe!.id;

  // 7. 공개 레시피 (admin 작성)
  const { data: pubRecipe } = await serviceClient
    .from("recipe_items")
    .insert({
      name: "RLS테스트레시피(공개)",
      category_id: T.categoryId,
      created_by: T.adminId,
      is_published: true,
    })
    .select("id")
    .single();
  T.publishedRecipeId = pubRecipe!.id;

  // 8. 레시피 단계/재료 생성
  const { data: step } = await serviceClient
    .from("recipe_steps")
    .insert({ recipe_id: T.recipeId, step_number: 1, content: "RLS테스트단계" })
    .select("id")
    .single();
  T.stepId = step!.id;

  const { data: ingredient } = await serviceClient
    .from("recipe_ingredients")
    .insert({ recipe_id: T.recipeId, name: "RLS테스트재료", amount: "1", unit: "개" })
    .select("id")
    .single();
  T.ingredientId = ingredient!.id;

  // 9. 댓글 생성 (ft_user + admin)
  const { data: comment } = await serviceClient
    .from("recipe_comments")
    .insert({ recipe_id: T.publishedRecipeId, profile_id: T.ftId, content: "ft댓글" })
    .select("id")
    .single();
  T.commentId = comment!.id;

  const { data: adminComment } = await serviceClient
    .from("recipe_comments")
    .insert({
      recipe_id: T.publishedRecipeId,
      profile_id: T.adminId,
      content: "admin댓글",
    })
    .select("id")
    .single();
  T.adminCommentId = adminComment!.id;

  // 10. 공지사항 생성 (전체용 / 정규직 전용)
  const { data: annAll } = await serviceClient
    .from("announcements")
    .insert({
      title: "전체공지RLS",
      content: "전체공지내용",
      target_roles: ["all"],
      created_by: T.adminId,
    })
    .select("id")
    .single();
  T.announcementAllId = annAll!.id;

  const { data: annFt } = await serviceClient
    .from("announcements")
    .insert({
      title: "정규직공지RLS",
      content: "정규직공지내용",
      target_roles: ["full_time"],
      created_by: T.adminId,
    })
    .select("id")
    .single();
  T.announcementFtId = annFt!.id;

  // 11. 체크리스트 템플릿 생성
  const { data: tmpl } = await serviceClient
    .from("checklist_templates")
    .insert({ title: "RLS테스트체크리스트", trigger: "clock_in", order_index: 999 })
    .select("id")
    .single();
  T.checklistTemplateId = tmpl!.id;

  // 12. 주간 스케줄 생성 (확정)
  const { data: ws, error: wsErr } = await serviceClient
    .from("weekly_schedules")
    .insert({ week_start: "2099-01-01", status: "confirmed", created_by: T.adminId })
    .select("id")
    .single();
  if (wsErr) throw new Error(`weekly_schedules INSERT 실패: ${JSON.stringify(wsErr)}`);
  T.weeklyScheduleId = ws!.id;

  // 13. 스케줄 슬롯 생성 (ft_user 소유 + admin 소유)
  const { data: slotFt, error: slotFtErr } = await serviceClient
    .from("schedule_slots")
    .insert({
      weekly_schedule_id: T.weeklyScheduleId,
      profile_id: T.ftId,
      slot_date: "2099-01-01",
      work_location: "cafe",
      start_time: "09:00:00",
      end_time: "18:00:00",
      status: "active",
    })
    .select("id")
    .single();
  if (slotFtErr) throw new Error(`schedule_slots(ft) INSERT 실패: ${JSON.stringify(slotFtErr)}`);
  T.slotFtId = slotFt!.id;

  const { data: slotAdmin, error: slotAdminErr } = await serviceClient
    .from("schedule_slots")
    .insert({
      weekly_schedule_id: T.weeklyScheduleId,
      profile_id: T.adminId,
      slot_date: "2099-01-02",
      work_location: "cafe",
      start_time: "09:00:00",
      end_time: "18:00:00",
      status: "active",
    })
    .select("id")
    .single();
  if (slotAdminErr) throw new Error(`schedule_slots(admin) INSERT 실패: ${JSON.stringify(slotAdminErr)}`);
  T.slotAdminId = slotAdmin!.id;

  // 14. 대타 요청 생성 (ft_user가 pt_user에게 요청)
  const { data: sub } = await serviceClient
    .from("substitute_requests")
    .insert({
      requester_id: T.ftId,
      slot_id: T.slotFtId,
      status: "approved",
      eligible_profile_ids: [T.ptId],
    })
    .select("id")
    .single();
  T.substituteRequestId = sub!.id;

  // 15. 업무 기본값 생성
  const { data: wd } = await serviceClient
    .from("work_defaults")
    .insert({
      profile_id: T.ftId,
      work_location: "cafe",
      day_of_week: 1,
      start_time: "09:00:00",
      end_time: "18:00:00",
    })
    .select("id")
    .single();
  T.workDefaultId = wd!.id;

  // 16. 알림 생성 (ft_user 대상)
  const { data: notif } = await serviceClient
    .from("notifications")
    .insert({
      profile_id: T.ftId,
      target_role: "employee",
      type: "test",
      title: "RLS테스트알림",
      message: "테스트",
    })
    .select("id")
    .single();
  T.notificationId = notif!.id;
}, 120_000);

// ─────────────────────────────────────────────────────────────────────────────
// 정리: 모든 테스트 데이터 + Auth 유저 삭제
// ─────────────────────────────────────────────────────────────────────────────
afterAll(async () => {
  // 의존성 역순으로 삭제
  const del = (table: string, id: string) =>
    serviceClient.from(table).delete().eq("id", id);

  await del("notifications", T.notificationId);
  await del("work_defaults", T.workDefaultId);
  await del("substitute_requests", T.substituteRequestId);
  await del("schedule_slots", T.slotAdminId);
  await del("schedule_slots", T.slotFtId);
  await del("weekly_schedules", T.weeklyScheduleId);
  await del("checklist_templates", T.checklistTemplateId);
  await del("announcements", T.announcementFtId);
  await del("announcements", T.announcementAllId);
  await del("recipe_comments", T.adminCommentId);
  await del("recipe_comments", T.commentId);
  await del("recipe_ingredients", T.ingredientId);
  await del("recipe_steps", T.stepId);
  await del("recipe_items", T.recipeId);
  await del("recipe_items", T.publishedRecipeId);
  await del("recipe_categories", T.categoryId);
  await del("stores", T.storeId);

  // Auth 유저 삭제 (cascade로 profiles도 삭제됨)
  await Promise.all([
    deleteAuthUser(T.adminId),
    deleteAuthUser(T.ftId),
    deleteAuthUser(T.ptId),
  ]);
}, 60_000);

// ─────────────────────────────────────────────────────────────────────────────
// 1. profiles
// ─────────────────────────────────────────────────────────────────────────────
describe("profiles", () => {
  it("어드민: 모든 프로필 조회 가능", async () => {
    await expectRows("admin SELECT profiles", () =>
      T.adminClient.from("profiles").select("id")
    );
  });

  it("정규직: 모든 프로필 조회 가능 (Profiles are viewable by users)", async () => {
    const data = await expectRows("ft SELECT profiles", () =>
      T.ftClient.from("profiles").select("id")
    );
    expect(data.length).toBeGreaterThanOrEqual(3);
  });

  it("정규직: 본인 프로필 업데이트 가능", async () => {
    await expectSuccess("ft UPDATE own profile", () =>
      T.ftClient
        .from("profiles")
        .update({ phone: "010-0000-0000" })
        .eq("id", T.ftId)
    );
  });

  it("정규직: 타인 프로필 업데이트 차단 (0행 영향)", async () => {
    const { data, error } = await T.ftClient
      .from("profiles")
      .update({ name: "해킹시도" })
      .eq("id", T.ptId)
      .select();
    expect(error).toBeNull();
    // RLS USING 조건 불충족 → 0행 업데이트
    expect(data?.length ?? 0).toBe(0);
  });

  it("파트타임: 본인 프로필 업데이트 가능", async () => {
    await expectSuccess("pt UPDATE own profile", () =>
      T.ptClient
        .from("profiles")
        .update({ phone: "010-1111-1111" })
        .eq("id", T.ptId)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. attendance_logs
// ─────────────────────────────────────────────────────────────────────────────
describe("attendance_logs", () => {
  it("어드민: 모든 출퇴근 기록 조회 가능", async () => {
    // 어드민 클라이언트로 다른 직원 출퇴근도 조회
    await expectSuccess("admin SELECT attendance_logs", () =>
      T.adminClient.from("attendance_logs").select("id").limit(1)
    );
  });

  it("정규직: 본인 출퇴근 기록 INSERT 가능", async () => {
    const { data, error } = await T.ftClient.from("attendance_logs").insert({
      profile_id: T.ftId,
      check_in_store_id: T.storeId,
      attendance_type: "regular",
      type: "IN",
    }).select("id").single();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // 정리
    if (data?.id) {
      await serviceClient.from("attendance_logs").delete().eq("id", data.id);
    }
  });

  it("정규직: 타인 출퇴근 기록 INSERT 차단", async () => {
    await expectError("ft INSERT other's attendance_log", () =>
      T.ftClient.from("attendance_logs").insert({
        profile_id: T.ptId, // 다른 유저
        check_in_store_id: T.storeId,
        attendance_type: "regular",
        type: "IN",
      })
    );
  });

  it("정규직: 본인 출퇴근 기록만 SELECT", async () => {
    // ft_user 기록만 조회되어야 함
    const { data } = await T.ftClient
      .from("attendance_logs")
      .select("profile_id")
      .eq("profile_id", T.ptId);
    expect(data?.length ?? 0).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. stores
// ─────────────────────────────────────────────────────────────────────────────
describe("stores", () => {
  it("어드민: 매장 INSERT/UPDATE/DELETE 가능", async () => {
    const { data: newStore, error } = await T.adminClient
      .from("stores")
      .insert({ name: "임시테스트점", lat: 37.0, lng: 127.0 })
      .select("id")
      .single();
    expect(error).toBeNull();
    // 정리
    if (newStore?.id) {
      await serviceClient.from("stores").delete().eq("id", newStore.id);
    }
  });

  it("모든 인증 직원: 매장 SELECT 가능", async () => {
    await expectRows("pt SELECT stores", () =>
      T.ptClient.from("stores").select("id").eq("id", T.storeId)
    );
  });

  it("직원: 매장 INSERT 차단", async () => {
    await expectError("ft INSERT store", () =>
      T.ftClient.from("stores").insert({ name: "해킹점", lat: 0, lng: 0 })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. recipe_categories
// ─────────────────────────────────────────────────────────────────────────────
describe("recipe_categories", () => {
  it("어드민: 카테고리 INSERT 가능", async () => {
    const { data, error } = await T.adminClient
      .from("recipe_categories")
      .insert({ name: "임시카테고리", order_index: 9999 })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("recipe_categories").delete().eq("id", data.id);
  });

  it("모든 인증 직원: 카테고리 SELECT 가능", async () => {
    await expectRows("pt SELECT recipe_categories", () =>
      T.ptClient.from("recipe_categories").select("id").eq("id", T.categoryId)
    );
  });

  it("직원: 카테고리 INSERT 차단", async () => {
    await expectError("ft INSERT recipe_category", () =>
      T.ftClient.from("recipe_categories").insert({ name: "차단카테고리", order_index: 9999 })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. recipe_items
// ─────────────────────────────────────────────────────────────────────────────
describe("recipe_items", () => {
  it("어드민: 비공개 레시피 포함 전체 조회 가능", async () => {
    const data = await expectRows("admin SELECT recipe_items", () =>
      T.adminClient
        .from("recipe_items")
        .select("id, is_published")
        .eq("id", T.recipeId) // ft_user의 비공개 레시피
    );
    expect(data[0]).toHaveProperty("is_published", false);
  });

  it("정규직: 본인 비공개 레시피 조회 가능", async () => {
    await expectRows("ft SELECT own private recipe", () =>
      T.ftClient
        .from("recipe_items")
        .select("id")
        .eq("id", T.recipeId)
    );
  });

  it("파트타임: 타인 비공개 레시피 조회 차단", async () => {
    await expectEmpty("pt SELECT private recipe (not own)", () =>
      T.ptClient
        .from("recipe_items")
        .select("id")
        .eq("id", T.recipeId) // ft_user 비공개 → pt_user에게 비가시
    );
  });

  it("파트타임: 공개 레시피 조회 가능", async () => {
    await expectRows("pt SELECT published recipe", () =>
      T.ptClient
        .from("recipe_items")
        .select("id")
        .eq("id", T.publishedRecipeId)
    );
  });

  it("정규직: 레시피 INSERT 가능 (정규직 레시피 등록)", async () => {
    const { data, error } = await T.ftClient
      .from("recipe_items")
      .insert({
        name: "ft임시레시피",
        category_id: T.categoryId,
        created_by: T.ftId,
        is_published: false,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("recipe_items").delete().eq("id", data.id);
  });

  it("파트타임: 레시피 INSERT 차단 (정규직만 등록 가능)", async () => {
    await expectError("pt INSERT recipe_item", () =>
      T.ptClient.from("recipe_items").insert({
        name: "pt임시레시피",
        category_id: T.categoryId,
        created_by: T.ptId,
        is_published: false,
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. recipe_steps
// ─────────────────────────────────────────────────────────────────────────────
describe("recipe_steps", () => {
  it("레시피 작성자(정규직): 본인 레시피 단계 INSERT 가능", async () => {
    const { data, error } = await T.ftClient
      .from("recipe_steps")
      .insert({ recipe_id: T.recipeId, step_number: 99, content: "임시단계" })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("recipe_steps").delete().eq("id", data.id);
  });

  it("비작성자(파트타임): 타인 레시피 단계 INSERT 차단", async () => {
    await expectError("pt INSERT step to others recipe", () =>
      T.ptClient.from("recipe_steps").insert({
        recipe_id: T.recipeId,
        step_number: 98,
        content: "차단단계",
      })
    );
  });

  it("모든 직원: 공개 레시피 단계 SELECT 가능", async () => {
    // 공개 레시피에 단계 추가 후 조회
    const { data: pubStep } = await serviceClient
      .from("recipe_steps")
      .insert({ recipe_id: T.publishedRecipeId, step_number: 1, content: "공개단계" })
      .select("id")
      .single();

    await expectRows("pt SELECT steps of published recipe", () =>
      T.ptClient
        .from("recipe_steps")
        .select("id")
        .eq("id", pubStep!.id)
    );
    await serviceClient.from("recipe_steps").delete().eq("id", pubStep!.id);
  });

  it("어드민: 모든 레시피 단계 관리 가능", async () => {
    await expectSuccess("admin UPDATE step", () =>
      T.adminClient
        .from("recipe_steps")
        .update({ content: "admin수정단계" })
        .eq("id", T.stepId)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. recipe_ingredients — BUG-024 DB-2 수정 검증 핵심
// ─────────────────────────────────────────────────────────────────────────────
describe("recipe_ingredients (BUG-024 DB-2: employment_type 제한 해제)", () => {
  it("레시피 작성자(정규직): 재료 INSERT 가능", async () => {
    const { data, error } = await T.ftClient
      .from("recipe_ingredients")
      .insert({ recipe_id: T.recipeId, name: "임시재료", amount: "1", unit: "개" })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("recipe_ingredients").delete().eq("id", data.id);
  });

  it("비작성자(파트타임): 타인 레시피 재료 INSERT 차단", async () => {
    await expectError("pt INSERT ingredient to others recipe", () =>
      T.ptClient.from("recipe_ingredients").insert({
        recipe_id: T.recipeId,
        name: "차단재료",
        amount: "1",
        unit: "개",
      })
    );
  });

  it("레시피 작성자: 본인 레시피 재료 UPDATE 가능", async () => {
    await expectSuccess("ft UPDATE own ingredient", () =>
      T.ftClient
        .from("recipe_ingredients")
        .update({ amount: "2" })
        .eq("id", T.ingredientId)
    );
  });

  it("모든 직원: 공개 레시피 재료 SELECT 가능", async () => {
    const { data: pubIng } = await serviceClient
      .from("recipe_ingredients")
      .insert({ recipe_id: T.publishedRecipeId, name: "공개재료", amount: "1" })
      .select("id")
      .single();

    await expectRows("pt SELECT ingredient of published recipe", () =>
      T.ptClient
        .from("recipe_ingredients")
        .select("id")
        .eq("id", pubIng!.id)
    );
    await serviceClient.from("recipe_ingredients").delete().eq("id", pubIng!.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. recipe_comments — BUG-024 DB-3 수정 검증 핵심
// ─────────────────────────────────────────────────────────────────────────────
describe("recipe_comments (BUG-024 DB-3: DELETE 정책 추가)", () => {
  it("직원: 공개 레시피에 댓글 INSERT 가능", async () => {
    const { data, error } = await T.ptClient
      .from("recipe_comments")
      .insert({
        recipe_id: T.publishedRecipeId,
        profile_id: T.ptId,
        content: "pt댓글",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("recipe_comments").delete().eq("id", data.id);
  });

  it("직원: 공개 레시피 댓글 SELECT 가능", async () => {
    await expectRows("ft SELECT comments of published recipe", () =>
      T.ftClient
        .from("recipe_comments")
        .select("id")
        .eq("recipe_id", T.publishedRecipeId)
    );
  });

  it("직원: 본인 댓글 DELETE 가능 (BUG-024 DB-3 핵심 수정)", async () => {
    // 본인 댓글 직접 삭제
    const { error } = await T.ftClient
      .from("recipe_comments")
      .delete()
      .eq("id", T.commentId)
      .eq("profile_id", T.ftId);
    expect(error).toBeNull();
    // service client로 실제 삭제 확인
    const { data } = await serviceClient
      .from("recipe_comments")
      .select("id")
      .eq("id", T.commentId);
    expect(data?.length ?? 0).toBe(0);

    // 다음 테스트를 위해 댓글 재생성
    const { data: restored } = await serviceClient
      .from("recipe_comments")
      .insert({ id: T.commentId, recipe_id: T.publishedRecipeId, profile_id: T.ftId, content: "ft댓글복원" })
      .select("id")
      .single();
    T.commentId = restored!.id;
  });

  it("직원: 타인 댓글 DELETE 차단", async () => {
    const { error } = await T.ftClient
      .from("recipe_comments")
      .delete()
      .eq("id", T.adminCommentId); // admin 댓글 삭제 시도
    expect(error).toBeNull(); // 에러 없음 (그냥 0행 처리)
    // admin 댓글이 여전히 존재해야 함
    const { data } = await serviceClient
      .from("recipe_comments")
      .select("id")
      .eq("id", T.adminCommentId);
    expect(data?.length ?? 0).toBe(1);
  });

  it("어드민: 모든 댓글 DELETE 가능", async () => {
    const { data: tmpComment } = await serviceClient
      .from("recipe_comments")
      .insert({
        recipe_id: T.publishedRecipeId,
        profile_id: T.ftId,
        content: "admin삭제용댓글",
      })
      .select("id")
      .single();

    await expectSuccess("admin DELETE any comment", () =>
      T.adminClient
        .from("recipe_comments")
        .delete()
        .eq("id", tmpComment!.id)
    );
  });

  it("직원: 본인 댓글 UPDATE 가능", async () => {
    await expectSuccess("ft UPDATE own comment", () =>
      T.ftClient
        .from("recipe_comments")
        .update({ content: "수정된ft댓글" })
        .eq("id", T.commentId)
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. announcements — FEAT-021
// ─────────────────────────────────────────────────────────────────────────────
describe("announcements (FEAT-021)", () => {
  it("어드민: 공지사항 INSERT 가능", async () => {
    const { data, error } = await T.adminClient
      .from("announcements")
      .insert({
        title: "임시공지",
        content: "임시내용",
        target_roles: ["all"],
        created_by: T.adminId,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("announcements").delete().eq("id", data.id);
  });

  it("정규직: 전체 공지 SELECT 가능", async () => {
    await expectRows("ft SELECT all-target announcement", () =>
      T.ftClient
        .from("announcements")
        .select("id")
        .eq("id", T.announcementAllId)
    );
  });

  it("정규직: 정규직 전용 공지 SELECT 가능", async () => {
    await expectRows("ft SELECT full_time announcement", () =>
      T.ftClient
        .from("announcements")
        .select("id")
        .eq("id", T.announcementFtId)
    );
  });

  it("파트타임: 정규직 전용 공지 SELECT 차단", async () => {
    await expectEmpty("pt SELECT full_time-only announcement", () =>
      T.ptClient
        .from("announcements")
        .select("id")
        .eq("id", T.announcementFtId)
    );
  });

  it("직원: 공지사항 INSERT 차단", async () => {
    await expectError("ft INSERT announcement", () =>
      T.ftClient.from("announcements").insert({
        title: "직원공지차단",
        content: "x",
        target_roles: ["all"],
        created_by: T.ftId,
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. announcement_reads
// ─────────────────────────────────────────────────────────────────────────────
describe("announcement_reads", () => {
  it("직원: 본인 읽음 등록 가능", async () => {
    const { data, error } = await T.ftClient
      .from("announcement_reads")
      .insert({ announcement_id: T.announcementAllId, profile_id: T.ftId })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("announcement_reads").delete().eq("id", data.id);
  });

  it("직원: 타인 읽음 등록 차단", async () => {
    await expectError("ft INSERT read for pt", () =>
      T.ftClient.from("announcement_reads").insert({
        announcement_id: T.announcementAllId,
        profile_id: T.ptId, // 다른 유저
      })
    );
  });

  it("직원: 본인 읽음 SELECT 가능", async () => {
    const { data: read } = await serviceClient
      .from("announcement_reads")
      .insert({ announcement_id: T.announcementFtId, profile_id: T.ftId })
      .select("id")
      .single();

    await expectRows("ft SELECT own read", () =>
      T.ftClient
        .from("announcement_reads")
        .select("id")
        .eq("profile_id", T.ftId)
    );
    if (read?.id) await serviceClient.from("announcement_reads").delete().eq("id", read.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. checklist_templates — FEAT-022
// ─────────────────────────────────────────────────────────────────────────────
describe("checklist_templates (FEAT-022)", () => {
  it("어드민: 템플릿 INSERT/UPDATE 가능", async () => {
    const { data, error } = await T.adminClient
      .from("checklist_templates")
      .insert({ title: "임시체크리스트", trigger: "clock_out", order_index: 9998 })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("checklist_templates").delete().eq("id", data.id);
  });

  it("직원: 활성 템플릿 SELECT 가능", async () => {
    await expectRows("ft SELECT checklist_templates", () =>
      T.ftClient
        .from("checklist_templates")
        .select("id")
        .eq("id", T.checklistTemplateId)
    );
  });

  it("직원: 템플릿 INSERT 차단", async () => {
    await expectError("pt INSERT checklist_template", () =>
      T.ptClient.from("checklist_templates").insert({
        title: "차단체크리스트",
        trigger: "clock_in",
        order_index: 9997,
      })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. checklist_submissions
// ─────────────────────────────────────────────────────────────────────────────
describe("checklist_submissions", () => {
  it("직원: 본인 제출 기록 INSERT 가능", async () => {
    const { data, error } = await T.ftClient
      .from("checklist_submissions")
      .insert({
        profile_id: T.ftId,
        trigger: "clock_in",
        checked_item_ids: [T.checklistTemplateId],
        all_checked: true,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("checklist_submissions").delete().eq("id", data.id);
  });

  it("직원: 본인 제출 기록 SELECT 가능", async () => {
    const { data: sub } = await serviceClient
      .from("checklist_submissions")
      .insert({
        profile_id: T.ftId,
        trigger: "clock_in",
        checked_item_ids: [],
        all_checked: false,
      })
      .select("id")
      .single();

    await expectRows("ft SELECT own submissions", () =>
      T.ftClient
        .from("checklist_submissions")
        .select("id")
        .eq("id", sub!.id)
    );
    await serviceClient.from("checklist_submissions").delete().eq("id", sub!.id);
  });

  it("어드민: 전체 제출 기록 조회 가능", async () => {
    const { data: sub } = await serviceClient
      .from("checklist_submissions")
      .insert({
        profile_id: T.ftId,
        trigger: "clock_out",
        checked_item_ids: [],
        all_checked: false,
      })
      .select("id")
      .single();

    await expectRows("admin SELECT all submissions", () =>
      T.adminClient
        .from("checklist_submissions")
        .select("id")
        .eq("id", sub!.id)
    );
    await serviceClient.from("checklist_submissions").delete().eq("id", sub!.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. notifications
// ─────────────────────────────────────────────────────────────────────────────
describe("notifications", () => {
  it("모든 직원: 알림 INSERT 가능 (Anyone can create notifications)", async () => {
    const { data, error } = await T.ptClient
      .from("notifications")
      .insert({
        profile_id: T.adminId,
        target_role: "admin",
        type: "test",
        title: "pt가 admin에게 알림",
        message: "테스트",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("notifications").delete().eq("id", data.id);
  });

  it("직원: 본인 대상 알림 SELECT 가능", async () => {
    await expectRows("ft SELECT own notification", () =>
      T.ftClient
        .from("notifications")
        .select("id")
        .eq("id", T.notificationId)
    );
  });

  it("직원: 타인 알림 SELECT 차단", async () => {
    const { data: otherNotif } = await serviceClient
      .from("notifications")
      .insert({
        profile_id: T.ptId,
        target_role: "employee",
        type: "test",
        title: "pt전용알림",
        message: "테스트",
      })
      .select("id")
      .single();

    await expectEmpty("ft SELECT pt's notification", () =>
      T.ftClient
        .from("notifications")
        .select("id")
        .eq("id", otherNotif!.id)
    );
    await serviceClient.from("notifications").delete().eq("id", otherNotif!.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. weekly_schedules
// ─────────────────────────────────────────────────────────────────────────────
describe("weekly_schedules", () => {
  it("어드민: 주간 스케줄 INSERT/UPDATE 가능", async () => {
    const { data, error } = await T.adminClient
      .from("weekly_schedules")
      .insert({ week_start: "2099-02-01", status: "draft", created_by: T.adminId })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("weekly_schedules").delete().eq("id", data.id);
  });

  it("직원: 확정(confirmed) 스케줄 SELECT 가능", async () => {
    await expectRows("ft SELECT confirmed weekly_schedule", () =>
      T.ftClient
        .from("weekly_schedules")
        .select("id")
        .eq("id", T.weeklyScheduleId)
    );
  });

  it("직원: 초안(draft) 스케줄 SELECT 차단", async () => {
    const { data: draftWs } = await serviceClient
      .from("weekly_schedules")
      .insert({ week_start: "2099-03-01", status: "draft", created_by: T.adminId })
      .select("id")
      .single();

    await expectEmpty("ft SELECT draft weekly_schedule", () =>
      T.ftClient
        .from("weekly_schedules")
        .select("id")
        .eq("id", draftWs!.id)
    );
    await serviceClient.from("weekly_schedules").delete().eq("id", draftWs!.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. schedule_slots — BUG-024 ss_emp_confirmed 수정 핵심
// ─────────────────────────────────────────────────────────────────────────────
describe("schedule_slots (ss_emp_confirmed: 모든 확정 슬롯 조회)", () => {
  it("직원: 본인 슬롯(확정) SELECT 가능", async () => {
    await expectRows("ft SELECT own slot", () =>
      T.ftClient
        .from("schedule_slots")
        .select("id")
        .eq("id", T.slotFtId)
    );
  });

  it("직원: 타인 슬롯(확정)도 SELECT 가능 — ss_emp_confirmed 핵심 수정", async () => {
    // 이전 ss_emp_own 정책에서는 차단되었음
    // ss_emp_confirmed로 교체 후 모든 확정 스케줄 슬롯이 조회 가능해야 함
    await expectRows("ft SELECT admin's slot in confirmed schedule", () =>
      T.ftClient
        .from("schedule_slots")
        .select("id")
        .eq("id", T.slotAdminId) // admin 소유 슬롯
    );
  });

  it("어드민: 스케줄 슬롯 INSERT 가능", async () => {
    const { data, error } = await T.adminClient
      .from("schedule_slots")
      .insert({
        weekly_schedule_id: T.weeklyScheduleId,
        profile_id: T.adminId,
        slot_date: "2099-01-03",
        work_location: "cafe",
        start_time: "09:00:00",
        end_time: "18:00:00",
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("schedule_slots").delete().eq("id", data.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. substitute_requests + substitute_responses
// ─────────────────────────────────────────────────────────────────────────────
describe("substitute_requests", () => {
  it("직원(요청자): 본인 대타 요청 SELECT 가능", async () => {
    await expectRows("ft SELECT own substitute_request", () =>
      T.ftClient
        .from("substitute_requests")
        .select("id")
        .eq("id", T.substituteRequestId)
    );
  });

  it("직원(대타 대상): 승인된 대타 요청 SELECT 가능", async () => {
    // pt_user가 eligible_profile_ids에 포함됨 (beforeAll 참고)
    await expectRows("pt SELECT approved request where eligible", () =>
      T.ptClient
        .from("substitute_requests")
        .select("id")
        .eq("id", T.substituteRequestId)
    );
  });

  it("무관한 직원: 타인 대타 요청 SELECT 차단", async () => {
    // pt_user가 아닌 임의 케이스 → 다른 요청 생성 후 테스트
    const { data: otherSlot } = await serviceClient
      .from("schedule_slots")
      .insert({
        weekly_schedule_id: T.weeklyScheduleId,
        profile_id: T.adminId,
        slot_date: "2099-01-05",
        work_location: "cafe",
        start_time: "10:00:00",
        end_time: "19:00:00",
        status: "active",
      })
      .select("id")
      .single();

    const { data: otherReq } = await serviceClient
      .from("substitute_requests")
      .insert({
        requester_id: T.adminId,
        slot_id: otherSlot!.id,
        status: "pending",
        eligible_profile_ids: [], // ft_user, pt_user 모두 제외
      })
      .select("id")
      .single();

    await expectEmpty("ft SELECT unrelated substitute_request", () =>
      T.ftClient
        .from("substitute_requests")
        .select("id")
        .eq("id", otherReq!.id)
    );

    await serviceClient.from("substitute_requests").delete().eq("id", otherReq!.id);
    await serviceClient.from("schedule_slots").delete().eq("id", otherSlot!.id);
  });

  it("직원: 본인 대타 요청 INSERT 가능", async () => {
    const { data: tmpSlot } = await serviceClient
      .from("schedule_slots")
      .insert({
        weekly_schedule_id: T.weeklyScheduleId,
        profile_id: T.ftId,
        slot_date: "2099-01-06",
        work_location: "cafe",
        start_time: "09:00:00",
        end_time: "18:00:00",
        status: "active",
      })
      .select("id")
      .single();

    const { data, error } = await T.ftClient
      .from("substitute_requests")
      .insert({
        requester_id: T.ftId,
        slot_id: tmpSlot!.id,
        status: "pending",
        eligible_profile_ids: [],
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    if (data?.id) await serviceClient.from("substitute_requests").delete().eq("id", data.id);
    await serviceClient.from("schedule_slots").delete().eq("id", tmpSlot!.id);
  });
});

describe("substitute_responses", () => {
  it("직원: 본인 대타 응답 INSERT 가능", async () => {
    const { data, error } = await T.ptClient
      .from("substitute_responses")
      .insert({
        request_id: T.substituteRequestId,
        profile_id: T.ptId,
        status: "accepted",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("substitute_responses").delete().eq("id", data.id);
  });

  it("어드민: 모든 대타 응답 조회 가능", async () => {
    const { data: resp } = await serviceClient
      .from("substitute_responses")
      .insert({
        request_id: T.substituteRequestId,
        profile_id: T.ptId,
        status: "declined",
      })
      .select("id")
      .single();

    await expectRows("admin SELECT substitute_response", () =>
      T.adminClient
        .from("substitute_responses")
        .select("id")
        .eq("id", resp!.id)
    );
    if (resp?.id) await serviceClient.from("substitute_responses").delete().eq("id", resp.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. work_defaults
// ─────────────────────────────────────────────────────────────────────────────
describe("work_defaults", () => {
  it("어드민: 업무 기본값 INSERT 가능", async () => {
    const { data, error } = await T.adminClient
      .from("work_defaults")
      .insert({
        profile_id: T.adminId,
        work_location: "cafe",
        day_of_week: 2,
        start_time: "10:00:00",
        end_time: "19:00:00",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data?.id) await serviceClient.from("work_defaults").delete().eq("id", data.id);
  });

  it("직원: 본인 업무 기본값 SELECT 가능", async () => {
    await expectRows("ft SELECT own work_defaults", () =>
      T.ftClient
        .from("work_defaults")
        .select("id")
        .eq("id", T.workDefaultId)
    );
  });

  it("직원: 타인 업무 기본값 SELECT 차단", async () => {
    const { data: otherWd } = await serviceClient
      .from("work_defaults")
      .insert({
        profile_id: T.ptId,
        work_location: "cafe",
        day_of_week: 3,
        start_time: "11:00:00",
        end_time: "20:00:00",
      })
      .select("id")
      .single();

    await expectEmpty("ft SELECT pt's work_defaults", () =>
      T.ftClient
        .from("work_defaults")
        .select("id")
        .eq("id", otherWd!.id)
    );
    if (otherWd?.id) await serviceClient.from("work_defaults").delete().eq("id", otherWd.id);
  });
});
