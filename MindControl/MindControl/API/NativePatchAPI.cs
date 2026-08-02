using Enemies;
using StateMachines;

namespace MindControl.API {
    public static class NativePatchAPI {
        public delegate bool ChangeStatePrefix(StateMachine<EB_StateBase> __instance, EB_StateBase state);
        public delegate void ChangeStatePostfix(StateMachine<EB_StateBase> __instance, EB_StateBase state);

        private static readonly List<ChangeStatePrefix> s_changePrefix = new();
        private static readonly List<ChangeStatePostfix> s_changePostfix = new();

        public static void AddChangeStatePrefix(ChangeStatePrefix detectPrefix) => s_changePrefix.Add(detectPrefix);
        public static void AddChangeStatePostfix(ChangeStatePostfix detectPostfix) => s_changePostfix.Add(detectPostfix);

        internal static bool RunChangeStatePrefix(StateMachine<EB_StateBase> __instance, EB_StateBase state) {
            bool runOrig = true;
            foreach (var prefix in s_changePrefix)
                runOrig &= prefix(__instance, state);
            return runOrig;
        }

        internal static void RunChangeStatePostfix(StateMachine<EB_StateBase> __instance, EB_StateBase state) {
            foreach (var postFix in s_changePostfix)
                postFix(__instance, state);
        }
    }
}
