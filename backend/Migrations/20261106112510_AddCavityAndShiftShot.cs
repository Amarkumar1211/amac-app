using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AmacBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddCavityAndShiftShot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "NoOfCavity",
                table: "MasterParts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<double>(
                name: "ShiftShot",
                table: "MasterParts",
                type: "float",
                nullable: false,
                defaultValue: 0.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NoOfCavity",
                table: "MasterParts");

            migrationBuilder.DropColumn(
                name: "ShiftShot",
                table: "MasterParts");
        }
    }
}
