import { ModuleLoader } from "@esm/@root/replay/moduleloader.js";
import { Factory } from "../../library/factory.js";
import { BulkheadController } from "../../parser/map/bulkheadcontroller.js";
import { EnvironmentModel } from "./environment.js";

declare module "@esm/@root/replay/moduleloader.js" {
    namespace Typemap {
        interface RenderPasses {
            "Vanilla.BulkheadControllers": void;
        }

        interface RenderData {
            "BulkheadControllers": Map<number, BulkheadControllerModel>;
        }
    }
}


class BulkheadControllerModel extends EnvironmentModel {
    constructor(value: BulkheadController) { super("bulkhead-controller", value); }
}

ModuleLoader.registerRender("Vanilla.BulkheadControllers", (name, api) => {
    const renderLoop = api.getRenderLoop();
    api.setRenderLoop([...renderLoop, { 
        name, pass: (renderer, snapshot) => {
            const stations = snapshot.header.getOrDefault("Vanilla.Map.BulkheadControllers", Factory("Map"));
            const models = renderer.getOrDefault("BulkheadControllers", Factory("Map"));
            for (const [id, controller] of stations.entries()) {
                if (!models.has(id)) {
                    const model = new BulkheadControllerModel(controller);
                    models.set(id, model);
                    model.addToScene(renderer.scene);
                }

                const model = models.get(id)!;
                const visible = controller.dimension === renderer.get("Dimension") && model.inView(renderer.get("Camera")!);
                model.setVisible(visible);
            }
        } 
    }]);
});
