import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Inject, Input, OnInit, Output } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import {
    ApiResponseError,
    CanDoResponse,
    ClassDefinition,
    Constants,
    IHasProperty,
    KnoraApiConnection,
    PropertyDefinition,
    ReadOntology,
    ResourceClassDefinitionWithAllLanguages,
    ResourcePropertyDefinitionWithAllLanguages,
    UpdateOntology,
    UpdateResourceClassCardinality
} from '@dasch-swiss/dsp-js';
import { CacheService } from 'src/app/main/cache/cache.service';
import { DspApiConnectionToken } from 'src/app/main/declarations/dsp-api-tokens';
import { DialogComponent } from 'src/app/main/dialog/dialog.component';
import { ErrorHandlerService } from 'src/app/main/error/error-handler.service';
import { NotificationService } from 'src/app/main/services/notification.service';
import { DefaultProperties, DefaultProperty, PropertyCategory, PropertyInfoObject } from '../default-data/default-properties';
import { DefaultClass, DefaultResourceClasses } from '../default-data/default-resource-classes';
import { CardinalityInfo } from '../ontology.component';
import { OntologyService } from '../ontology.service';

@Component({
    selector: 'app-resource-class-info',
    templateUrl: './resource-class-info.component.html',
    styleUrls: ['./resource-class-info.component.scss']
})
export class ResourceClassInfoComponent implements OnInit {

    // open / close res class card
    @Input() expanded = false;

    @Input() resourceClass: ClassDefinition;

    @Input() projectCode: string;

    @Input() projectStatus: boolean;

    @Input() ontoProperties: ResourcePropertyDefinitionWithAllLanguages[] = [];

    @Input() lastModificationDate?: string;

    // event emitter when the lastModificationDate changed; bidirectional binding with lastModificationDate parameter
    @Output() lastModificationDateChange: EventEmitter<string> = new EventEmitter<string>();

    // event emitter when the lastModificationDate changed; bidirectional binding with lastModificationDate parameter
    @Output() ontoPropertiesChange: EventEmitter<PropertyDefinition[]> = new EventEmitter<PropertyDefinition[]>();

    // to update the resource class itself (edit or delete)
    @Output() editResourceClass: EventEmitter<DefaultClass> = new EventEmitter<DefaultClass>();
    @Output() deleteResourceClass: EventEmitter<DefaultClass> = new EventEmitter<DefaultClass>();

    // to update the cardinality we need the information about property (incl. propType) and resource class
    @Output() updateCardinality: EventEmitter<string> = new EventEmitter<string>();


    ontology: ReadOntology;

    cardinalityUpdateEnabled: boolean;

    classCanBeDeleted: boolean;

    classCanReplaceCardinality: boolean;

    // list of properties that can be displayed (not all of the props should be displayed)
    propsToDisplay: IHasProperty[] = [];

    subClassOfLabel = '';

    // list of default resource classes
    defaultClasses: DefaultClass[] = DefaultResourceClasses.data;

    // list of default property types
    defaultProperties: PropertyCategory[] = DefaultProperties.data;

    // list of existing ontology properties, which are not in this resource class
    existingProperties: PropertyInfoObject[];

    constructor(
        @Inject(DspApiConnectionToken) private _dspApiConnection: KnoraApiConnection,
        private _cache: CacheService,
        private _dialog: MatDialog,
        private _errorHandler: ErrorHandlerService,
        private _notification: NotificationService,
        private _ontoService: OntologyService
    ) { }

    ngOnInit(): void {

        this._cache.get('currentOntology').subscribe(
            (response: ReadOntology) => {
                this.ontology = response;
                this.lastModificationDate = this.ontology.lastModificationDate;
                // translate iris from "sub class of" array
                this.translateSubClassOfIri(this.resourceClass.subClassOf);
                // prepare list of properties to display
                this.preparePropsToDisplay(this.resourceClass.propertiesList);
                // check if the class can be deleted
                this.canBeDeleted();
                // check if the cardinalities can be changed
                this.canReplaceCardinality();
            },
            (error: ApiResponseError) => {
                this._errorHandler.showMessage(error);
            }
        );

    }

    /**
     * translates iris from "sub class of" array
     * - display label from default resource classes (as part of DSP System Project)
     * - in case the class is a subclass of another class in the same ontology: display this class label
     * - in none of those cases display the name from the class IRI
     *
     * @param classIris
     */
    translateSubClassOfIri(classIris: string[]) {

        // reset the label
        this.subClassOfLabel = '';

        classIris.forEach((iri, index) => {
            // get ontology iri from class iri
            const splittedIri = iri.split('#');
            const ontologyIri = splittedIri[0];
            const className = splittedIri[1];

            this.subClassOfLabel += (index > 0 ? ', ' : '');

            // find default class for the current class iri
            const defaultClass = this.defaultClasses.find(i => i.iri === iri);
            if (defaultClass) {
                this.subClassOfLabel += defaultClass.label;
                this.cardinalityUpdateEnabled = true;
            } else if (this.ontology.id === ontologyIri) {
                // the class is not defined in the default classes
                // but defined in the current ontology
                // get class label from there
                this.subClassOfLabel += this.ontology.classes[iri].label;
                // in this case, the user can't update the cardinality incl. the gui order in this class
                // we have to disable this update cardinality functionality
                this.cardinalityUpdateEnabled = false;
            } else {
                // the ontology iri of the upper class couldn't be found
                // display the class name
                if (className) {
                    this.subClassOfLabel += className;
                } else {
                    // iri is not kind of [ontologyIri]#[className]
                    this.subClassOfLabel += iri.split('/').filter(e => e).slice(-1);
                }
                // in this case, the user can't update the cardinality incl. the gui order in this class
                // we have to disable this update cardinality functionality
                this.cardinalityUpdateEnabled = false;
            }
        });

    }

    /**
     * prepares props to display
     * Not all props should be displayed; there are some system / API-specific
     * properties which have to be filtered.
     *
     * @param props
     */
    preparePropsToDisplay(classProps: IHasProperty[]) {

        const ontoProps = <ResourcePropertyDefinitionWithAllLanguages[]>this.ontology.getAllPropertyDefinitions();

        // reset properties to display
        this.propsToDisplay = [];
        // reset existing properties to select from
        this.existingProperties = [];

        classProps.forEach((hasProp: IHasProperty) => {

            const propToDisplay = ontoProps.find(obj =>
                obj.id === hasProp.propertyIndex &&
                ((obj.subjectType && !obj.subjectType.includes('Standoff')) && obj.objectType !== Constants.LinkValue || !obj.isLinkValueProperty)
            );

            if (propToDisplay) {
                // add to list of properties to display in res class
                this.propsToDisplay.push(hasProp);
                // and remove from list of existing properties which can be added
                this.ontoProperties = this.ontoProperties.filter(prop => !(prop.id === propToDisplay.id));
            }

        });

        this.ontoProperties.forEach((availableProp: ResourcePropertyDefinitionWithAllLanguages) => {
            const superProp = this._ontoService.getSuperProperty(availableProp);
            if (superProp) {
                if (availableProp.subPropertyOf.indexOf(superProp) === -1) {
                    availableProp.subPropertyOf.push(superProp);
                }
            }

            let propType: DefaultProperty;
            // find corresponding default property to have more prop info
            this._ontoService.getDefaultPropType(availableProp).subscribe(
                (prop: DefaultProperty) => {
                    propType = prop;
                }
            );

            this.existingProperties.push(
                {
                    propType: propType,
                    propDef: availableProp
                }
            );
        });

    }

    canBeDeleted() {

        // check if the class can be deleted
        this._dspApiConnection.v2.onto.canDeleteResourceClass(this.resourceClass.id).subscribe(
            (response: CanDoResponse) => {
                this.classCanBeDeleted = response.canDo;
            },
            (error: ApiResponseError) => {
                this._errorHandler.showMessage(error);
            }
        );
    }

    canReplaceCardinality() {
        this._dspApiConnection.v2.onto.canReplaceCardinalityOfResourceClass(this.resourceClass.id).subscribe(
            (response: CanDoResponse) => {
                this.classCanReplaceCardinality = response.canDo;
            },
            (error: ApiResponseError) => {
                this._errorHandler.showMessage(error);
            }
        );
    }

    addNewProperty(propType: DefaultProperty) {
        const cardinality: CardinalityInfo = {
            resClass: this.resourceClass,
            property: {
                propType: propType
            }
        };
        this.updateCard(cardinality);
    }

    addExistingProperty(propDef: ResourcePropertyDefinitionWithAllLanguages) {

        // find prop type from list of existing properties
        const pos = this.existingProperties.findIndex(item => item.propDef.id === propDef.id);

        const propType = this.existingProperties[pos].propType;

        const cardinality: CardinalityInfo = {
            resClass: this.resourceClass,
            property: {
                propType: propType,
                propDef: propDef,
            }
        };

        this.updateCard(cardinality);
    }

    /**
     * removes property from resource class
     * @param property
     */
    removeProperty(property: DefaultClass) {

        const onto = new UpdateOntology<UpdateResourceClassCardinality>();

        onto.lastModificationDate = this.lastModificationDate;

        onto.id = this.ontology.id;

        const delCard = new UpdateResourceClassCardinality();

        delCard.id = this.resourceClass.id;

        delCard.cardinalities = [];

        this.propsToDisplay = this.propsToDisplay.filter(prop => (prop.propertyIndex === property.iri));

        delCard.cardinalities = this.propsToDisplay;
        onto.entity = delCard;

        this._dspApiConnection.v2.onto.deleteCardinalityFromResourceClass(onto).subscribe(
            (res: ResourceClassDefinitionWithAllLanguages) => {

                this.lastModificationDate = res.lastModificationDate;
                this.lastModificationDateChange.emit(this.lastModificationDate);
                this.preparePropsToDisplay(this.propsToDisplay);

                this.updateCardinality.emit(this.ontology.id);
                // display success message
                this._notification.openSnackBar(`You have successfully removed "${property.label}" from "${this.resourceClass.label}".`);
            },
            (error: ApiResponseError) => {
                this._errorHandler.showMessage(<ApiResponseError>error);
            }
        );

    }

    /**
     * updates cardinality
     * @param card cardinality info object
     */
    updateCard(card: CardinalityInfo) {

        if (card) {
            const classLabel = card.resClass.label;

            let mode: 'createProperty' | 'updateCardinality' = 'createProperty';
            let propLabel = card.property.propType.group + ': ' + card.property.propType.label;
            let title = 'Add new property of type "' + propLabel + '" to class "' + classLabel + '"';

            if (card.property.propDef) {
                // the property exists already
                mode = 'updateCardinality';
                propLabel = card.property.propDef.label;
                title = 'Add existing property "' + propLabel + '" to class "' + classLabel + '"';
            }

            const dialogConfig: MatDialogConfig = {
                width: '640px',
                maxHeight: '80vh',
                position: {
                    top: '112px'
                },
                data: {
                    propInfo: card.property,
                    title: title,
                    subtitle: 'Customize property and cardinality',
                    mode: mode,
                    parentIri: card.resClass.id,
                    position: this.propsToDisplay.length + 1,
                    canBeUpdated: this.classCanReplaceCardinality
                }
            };

            const dialogRef = this._dialog.open(
                DialogComponent,
                dialogConfig
            );

            dialogRef.afterClosed().subscribe(result => {
                // update the view: list of properties in resource class
                this.updateCardinality.emit(this.ontology.id);
            });
        }

    }


    /**
     * drag and drop property line
     */
    drop(event: CdkDragDrop<string[]>) {

        // set sort order for child component
        moveItemInArray(this.propsToDisplay, event.previousIndex, event.currentIndex);

        if (event.previousIndex !== event.currentIndex) {
            // the dropped property item has a new index (= gui order)
            // send the new gui-order to the api by
            // preparing the UpdateOntology object first
            const onto = new UpdateOntology<UpdateResourceClassCardinality>();

            onto.lastModificationDate = this.lastModificationDate;

            onto.id = this.ontology.id;

            const addCard = new UpdateResourceClassCardinality();

            addCard.id = this.resourceClass.id;

            addCard.cardinalities = [];

            this.propsToDisplay.forEach((prop, index) => {
                const propCard: IHasProperty = {
                    propertyIndex: prop.propertyIndex,
                    cardinality: prop.cardinality,
                    guiOrder: index + 1
                };

                addCard.cardinalities.push(propCard);
            });

            onto.entity = addCard;

            // send the request to the api
            this._dspApiConnection.v2.onto.replaceGuiOrderOfCardinalities(onto).subscribe(
                (responseGuiOrder: ResourceClassDefinitionWithAllLanguages) => {
                    this.lastModificationDate = responseGuiOrder.lastModificationDate;

                    // successful request: update the view
                    this.preparePropsToDisplay(this.propsToDisplay);

                    this.lastModificationDateChange.emit(this.lastModificationDate);

                    // display success message
                    this._notification.openSnackBar(`You have successfully changed the order of properties in the resource class "${this.resourceClass.label}".`);

                },
                (error: ApiResponseError) => {
                    this._errorHandler.showMessage(error);
                }
            );

        }

    }

}
