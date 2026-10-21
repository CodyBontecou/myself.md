/** The single supported Cloud subscription. */
/** @typedef {'cloud_100gb'} CloudPlanId */
/** @typedef {'monthly'|'yearly'} CloudPeriod */
/** @typedef {{id:CloudPlanId,capacityBytes:number,label:string,usPrice:Record<CloudPeriod,string>,ios:Record<CloudPeriod,string>,android:{productId:string,basePlans:Record<CloudPeriod,string>}}} CloudPlan */

/** The single plan offered for new purchases. @type {readonly CloudPlan[]} */
export const cloudPlans = [
  {
    id: 'cloud_100gb',
    capacityBytes: 100_000_000_000,
    label: '100 GB',
    usPrice: { monthly: '$7.99', yearly: '$79.99' },
    ios: { monthly: 'myself_md_cloud_100gb_monthly', yearly: 'myself_md_cloud_100gb_yearly' },
    android: {
      productId: 'myself_md_cloud_100gb',
      basePlans: { monthly: 'monthly', yearly: 'yearly' },
    },
  },
];
/** @param {unknown} id */
export function cloudPlan(id) {
  return cloudPlans.find((plan) => plan.id === id) ?? null;
}
/** Map a store product to the Cloud plan. Android requires the base plan; iOS product IDs are period-specific.
 * @param {'ios'|'android'} store @param {string} productId @param {string} [basePlanId]
 * @returns {{plan:CloudPlan,period:CloudPeriod}|null} */
export function cloudPlanForProduct(store, productId, basePlanId) {
  for (const plan of cloudPlans)
    for (const period of /** @type {CloudPeriod[]} */ (['monthly', 'yearly'])) {
      if (store === 'ios' && plan.ios[period] === productId) return { plan, period };
      if (
        store === 'android' &&
        plan.android.productId === productId &&
        plan.android.basePlans[period] === basePlanId
      )
        return { plan, period };
    }
  return null;
}
