using API;
using BepInEx.Unity.IL2CPP.Hook;
using Enemies;
using Il2CppInterop.Runtime;
using Il2CppInterop.Runtime.Runtime;
using Il2CppInterop.Runtime.Runtime.VersionSpecific.Class;
using Il2CppInterop.Runtime.Runtime.VersionSpecific.MethodInfo;
using Il2CppSystem.Runtime.InteropServices;
using MindControl.API;
using StateMachines;

namespace MindControl.NativePatches {
    internal static class ChangeStatePatches {
        private static INativeDetour? ChangeStateDetour;
        private static d_ChangeStateFromQueue? orig_ChangeStateFromQueue;
        private unsafe delegate void d_ChangeStateFromQueue(IntPtr _this, Il2CppMethodInfo* methodInfo);

        internal unsafe static void ApplyNativePatch() {
            NativePatchAPI.AddChangeStatePrefix(EnemyController.ChangeStatePrefix);

            INativeClassStruct val = UnityVersionHandler.Wrap((Il2CppClass*)Il2CppClassPointerStore<StateMachine<ES_Base>>.NativeClassPtr);

            for (int i = 0; i < val.MethodCount; i++) {
                INativeMethodInfoStruct val2 = UnityVersionHandler.Wrap(val.Methods[i]);

                if (Marshal.PtrToStringAnsi(val2.Name) == "ChangeStateFromQueue") {
                    ChangeStateDetour = INativeDetour.CreateAndApply<d_ChangeStateFromQueue>(val2.MethodPointer, ChangeStatePatch, out orig_ChangeStateFromQueue);
                    return;
                }
            }
        }

        private unsafe static void ChangeStatePatch(IntPtr _this, Il2CppMethodInfo* methodInfo) {
            StateMachine<EB_StateBase> machine = new(_this);
            if (machine.CurrentState == null) {
                orig_ChangeStateFromQueue!(_this, methodInfo);
                return;
            }

            EB_StateBase state = machine.m_stateQueue.Peek();

            bool runOriginal = true;
            try {
                runOriginal = NativePatchAPI.RunChangeStatePrefix(machine, state);
            } catch (Exception e) {
                APILogger.Error($"Error running ChangeStatePrefix: {e.StackTrace}");
            }

            if (runOriginal)
                orig_ChangeStateFromQueue!(_this, methodInfo);
            else
                machine.m_stateQueue.Dequeue();

            try {
                NativePatchAPI.RunChangeStatePostfix(machine, state);
            } catch (Exception e) {
                APILogger.Error($"Error running ChangeStatePostfix: {e.StackTrace}");
            }
        }
    }
}
